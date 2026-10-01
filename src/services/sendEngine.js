// Send engine: persistent queue in SQLite, survives restarts.
// - Buffered: random delay each email. Batch: N sends, long rest.
// - Daily cap (pause or stop), sending window, retry x3 backoff.
// - Idempotency: skip if already sent (UNIQUE + status check).
// - Dry run: timing + logs, sends nothing.
// - Write-back: Status/Sent At/Error columns to the Sheet if enabled.
const db = require('../db');
const { info, error, logEvent } = require('../utils/logger');
const { renderTemplate } = require('../utils/template');
const { decrypt } = require('../utils/crypto');
const { clientFromTokens } = require('./googleAuth');
const { sendEmail } = require('./gmailService');
const { writeBack } = require('./sheetsService');
const { bufferedDelay, batchInnerDelay, inWindow, backoffSec } = require('../utils/scheduler');

const runners = new Map(); // campaignId -> true
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function sentToday() {
  const r = db.prepare(`SELECT COUNT(*) c FROM recipients WHERE status='sent' AND date(sent_at)=date('now')`).get();
  return r ? r.c : 0;
}
function sender() {
  const acc = db.prepare('SELECT * FROM accounts ORDER BY id LIMIT 1').get();
  if (!acc) throw new Error('Google not connected.');
  let senderName = '';
  try { senderName = db.prepare("SELECT value FROM settings WHERE key='sender_name'").get()?.value || ''; } catch (e) { /* default */ }
  return { client: clientFromTokens(JSON.parse(decrypt(acc.tokens_encrypted))), email: acc.email, senderName };
}
// Interruptible sleep so Pause/Cancel react within 2s.
async function patientSleep(totalSec, campaignId) {
  let waited = 0;
  while (waited < totalSec) {
    const st = db.prepare('SELECT status FROM campaigns WHERE id=?').get(campaignId);
    if (!st || st.status !== 'running') return false; // stop waiting
    const chunk = Math.min(2, totalSec - waited);
    await sleep(chunk);
    waited += chunk;
    // Expose countdown for live page.
    runners.set(campaignId + ':nextIn', Math.round(totalSec - waited));
  }
  return true;
}

async function runCampaign(campaignId) {
  if (runners.has(campaignId)) { info(`Campaign ${campaignId} already running`); return; }
  runners.set(campaignId, true);
  runners.set(campaignId + ':current', '');
  info(`Runner started for ${campaignId}`);
  try {
    const camp = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
    if (!camp) throw new Error('Campaign gone');
    // Resume: anything left 'queued' from a crash goes back to pending.
    db.prepare("UPDATE recipients SET status='pending' WHERE campaign_id=? AND status='queued'").run(campaignId);
    db.prepare("UPDATE campaigns SET status='running', started_at=COALESCE(started_at, datetime('now')) WHERE id=?").run(campaignId);
    logEvent(campaignId, null, 'start', `${camp.mode} dry=${camp.dry_run} cap=${camp.daily_cap}`);
    const { client, email: from, senderName } = sender();
    let inBatch = 0;

    while (true) {
      const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
      if (!c || ['completed', 'cancelled', 'failed'].includes(c.status)) break;
      if (c.status === 'paused') { await sleep(3); continue; }

      // Daily cap.
      if (sentToday() >= (c.daily_cap || 400)) {
        const action = c.cap_action === 'stop' ? 'cancelled' : 'paused';
        db.prepare('UPDATE campaigns SET status=? WHERE id=?').run(action, campaignId);
        logEvent(campaignId, null, 'daily_cap', `Cap ${c.daily_cap}/day reached -> ${action}`);
        break;
      }
      // Sending window.
      if (c.window_enabled && !inWindow(new Date(), c.window_start, c.window_end, c.window_tz)) {
        runners.set(campaignId + ':current', 'Waiting for sending window ' + c.window_start + '-' + c.window_end);
        await sleep(30);
        continue;
      }
      // Batch rest.
      if (c.mode === 'batch' && inBatch >= c.batch_size) {
        logEvent(campaignId, null, 'batch_rest', `Resting ${c.batch_pause_min} min`);
        runners.set(campaignId + ':current', `Batch rest (${c.batch_pause_min} min)`);
        const go = await patientSleep(c.batch_pause_min * 60, campaignId);
        inBatch = 0;
        if (!go) continue;
        continue;
      }

      const p = db.prepare("SELECT * FROM recipients WHERE campaign_id=? AND status='pending' AND (next_try_at IS NULL OR next_try_at <= datetime('now')) ORDER BY id LIMIT 1").get(campaignId);
      if (!p) {
        // Done? (no pending and none scheduled for retry)
        const left = db.prepare("SELECT COUNT(*) n FROM recipients WHERE campaign_id=? AND status IN ('pending','queued')").get(campaignId).n;
        if (left === 0) {
          db.prepare("UPDATE campaigns SET status='completed', finished_at=datetime('now') WHERE id=?").run(campaignId);
          logEvent(campaignId, null, 'complete', 'Finished');
        } else {
          await sleep(5); // retries scheduled in future
          continue;
        }
        break;
      }

      // Idempotency: skip if somehow already sent.
      if (p.status === 'sent' && p.gmail_message_id) continue;
      db.prepare("UPDATE recipients SET status='queued' WHERE id=? AND status='pending'").run(p.id);
      const check = db.prepare('SELECT status, gmail_message_id FROM recipients WHERE id=?').get(p.id);
      if (check.status === 'sent' && check.gmail_message_id) continue; // another runner sent it

      runners.set(campaignId + ':current', p.email);
      let data = {};
      try { data = JSON.parse(p.data_json || '{}'); } catch (e) { /* ignore */ }
      data.email = p.email; data.name = p.name || data.name || '';
      const subject = renderTemplate(c.subject, data);
      const html = renderTemplate(c.body_html, data) + `<br/><br/>---<br/><small>${c.footer || ''}<br/>From: ${from}</small>`;

      if (c.dry_run) {
        db.prepare("UPDATE recipients SET status='sent', sent_at=datetime('now'), error_message='DRY RUN' WHERE id=?").run(p.id);
        logEvent(campaignId, p.id, 'sent', `DRY RUN to ${p.email}`);
      } else {
        try {
          const msgId = await sendEmail(client, p.email, subject, html, from, { senderName, replyTo: from });
          db.prepare("UPDATE recipients SET status='sent', gmail_message_id=?, sent_at=datetime('now'), attempts=attempts+1 WHERE id=?").run(msgId, p.id);
          logEvent(campaignId, p.id, 'sent', p.email);
          if (c.write_back) {
            try { await writeBack(client, c.sheet_id, c.sheet_tab, Object.keys(JSON.parse(p.data_json || '{}')), [{ row: JSON.parse(p.data_json || '{}')._row || 2, status: 'Sent', sentAt: new Date().toISOString(), error: '' }]); } catch (e) { /* non-fatal */ }
          }
        } catch (e) {
          const msg = String(e.message || e).slice(0, 400);
          const attempts = (p.attempts || 0) + 1;
          // Auth/quota: pause whole campaign with clear message.
          if (/invalid_grant|unauthorized|quota|exceed|403|forbidden/i.test(msg)) {
            db.prepare("UPDATE recipients SET status='pending', attempts=?, error_message=? WHERE id=?").run(attempts, msg, p.id);
            db.prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(campaignId);
            logEvent(campaignId, p.id, 'auto_pause', msg);
            break;
          }
          if (/429|rate|5\d\d|timeout|network/i.test(msg) && attempts <= 3) {
            const wait = backoffSec(attempts);
            db.prepare("UPDATE recipients SET status='pending', attempts=?, next_try_at=datetime('now', '+' || ? || ' seconds'), error_message=? WHERE id=?").run(attempts, wait, 'retry in ' + wait + 's: ' + msg, p.id);
            logEvent(campaignId, p.id, 'retry', `Attempt ${attempts}, backoff ${wait}s: ${msg}`);
          } else {
            db.prepare("UPDATE recipients SET status='failed', attempts=?, error_message=? WHERE id=?").run(attempts, msg, p.id);
            logEvent(campaignId, p.id, 'failed', msg);
          }
        }
      }
      inBatch++;
      const wait = c.mode === 'batch'
        ? batchInnerDelay(c.batch_delay_min_sec, c.batch_delay_max_sec)
        : bufferedDelay(c.min_delay_sec, c.max_delay_sec);
      runners.set(campaignId + ':nextIn', Math.round(wait));
      await patientSleep(wait, campaignId);
    }
  } catch (e) {
    error(`Runner ${campaignId}:`, e.message);
    try {
      db.prepare("UPDATE campaigns SET status='failed' WHERE id=?").run(campaignId);
      logEvent(campaignId, null, 'failed', e.message.slice(0, 400));
    } catch (e2) { /* ignore */ }
  } finally {
    runners.delete(campaignId);
    runners.delete(campaignId + ':current');
    runners.delete(campaignId + ':nextIn');
    info(`Runner stopped for ${campaignId}`);
  }
}

function liveState(campaignId) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
  if (!c) return null;
  const rows = db.prepare("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status").all(campaignId);
  const counts = { pending: 0, queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return {
    campaign: c, counts, total: Object.values(counts).reduce((a, b) => a + b, 0),
    running: runners.has(Number(campaignId)),
    current: runners.get(Number(campaignId) + ':current') || '',
    nextInSec: runners.get(Number(campaignId) + ':nextIn') || 0,
    sentToday: sentToday(),
  };
}

module.exports = { runCampaign, liveState, sentToday, isRunning: (id) => runners.has(Number(id)) };
