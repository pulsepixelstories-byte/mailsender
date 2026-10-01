// Campaigns: create draft (sheet import + mapping) + send-test-to-self.
// Start/pause/resume/cancel engine controls arrive in Phase 4.
const express = require('express');
const db = require('../db');
const { decrypt } = require('../utils/crypto');
const { clientFromTokens } = require('../services/googleAuth');
const { readTab } = require('../services/sheetsService');
const { sendEmail } = require('../services/gmailService');
const { renderTemplate } = require('../utils/template');
const { extractSheetId, dedupEmails } = require('../utils/validators');
const { logEvent } = require('../utils/logger');
const router = express.Router();

function getClient(res) {
  const acc = db.prepare('SELECT * FROM accounts ORDER BY id LIMIT 1').get();
  if (!acc) { res.status(401).json({ error: 'Connect Google first.' }); return null; }
  try {
    const tokens = JSON.parse(decrypt(acc.tokens_encrypted));
    return { client: clientFromTokens(tokens), email: acc.email };
  } catch (e) {
    res.status(500).json({ error: 'Login broken (' + e.message + '). Reconnect Google.' });
    return null;
  }
}

// CREATE draft: import sheet rows -> recipients (deduped). Body validated.
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Campaign name required' });
  if (!b.subject?.trim()) return res.status(400).json({ error: 'Subject required' });
  if (!b.body_html?.trim()) return res.status(400).json({ error: 'Message required' });
  const sheetId = extractSheetId(b.sheet_id || '');
  if (!sheetId) return res.status(400).json({ error: 'That doesn\'t look like a Google Sheet link. Paste the full link (https://docs.google.com/spreadsheets/d/.../edit).' });
  if (!b.sheet_tab) return res.status(400).json({ error: 'Choose sheet + tab first' });
  const auth = getClient(res); if (!auth) return;
  try {
    const { headers, rows } = await readTab(auth.client, sheetId, b.sheet_tab);
    const emailCol = b.email_col || headers[0];
    // Remap _email to chosen column.
    const remapped = rows.map((r) => ({ ...r, _email: String(r[emailCol] ?? r._email ?? '').trim() }));
    const { valid, invalid, duplicates } = dedupEmails(remapped);
    if (!valid.length) return res.status(400).json({ error: 'No valid emails in that column' });
    const r = db.prepare(`INSERT INTO campaigns
      (name, sheet_id, sheet_tab, email_col, col_map_json, subject, body_html, footer, write_back, mode,
       min_delay_sec, max_delay_sec, batch_size, batch_delay_min_sec, batch_delay_max_sec, batch_pause_min,
       daily_cap, cap_action, window_enabled, window_start, window_end, window_tz, dry_run)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      b.name.trim(), sheetId, b.sheet_tab, emailCol, JSON.stringify(b.col_map || {}),
      b.subject, b.body_html, b.footer || 'Reply STOP to unsubscribe.',
      b.write_back ? 1 : 0, b.mode === 'batch' ? 'batch' : 'buffered',
      b.min_delay_sec ?? 30, b.max_delay_sec ?? 90, b.batch_size ?? 10,
      b.batch_delay_min_sec ?? 10, b.batch_delay_max_sec ?? 25, b.batch_pause_min ?? 15,
      b.daily_cap ?? 400, b.cap_action || 'pause',
      b.window_enabled ? 1 : 0, b.window_start || '09:00', b.window_end || '18:00',
      b.window_tz || 'Asia/Dhaka', b.dry_run ? 1 : 0);
    const cid = Number(r.lastInsertRowid); // Number() = safe on every Node version
    const ins = db.prepare('INSERT OR IGNORE INTO recipients (campaign_id, email, name, data_json) VALUES (?,?,?,?)');
    const tx = db.transaction((list) => {
      for (const p of list) ins.run(cid, p._email.toLowerCase(), p._name || '', JSON.stringify(p));
    });
    tx(valid);
    const imported = db.prepare("SELECT COUNT(*) n FROM recipients WHERE campaign_id=?").get(cid).n;
    logEvent(cid, null, 'import', `Imported ${imported} (invalid ${invalid}, dupes ${duplicates})`);
    res.json({ id: cid, imported, invalid, duplicates });
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e.message || String(e);
    const code = e?.code ?? e?.status ?? e?.response?.status ?? 0;
    if (code === 404 || /not.?found/i.test(msg)) {
      const err = new Error(`Sheet not found. Check the link, open it in your browser, and Share it with your sender Gmail as Viewer, then try again. (${String(msg).slice(0, 200)})`);
      err.status = 404;
      return next(err);
    }
    if (code === 403 || /permission|forbidden|access|insufficient/i.test(msg)) {
      const err = new Error(`No access to this sheet. Share it with your sender Gmail as Viewer and try again. (${String(msg).slice(0, 200)})`);
      err.status = 403;
      return next(err);
    }
    if (/unable to parse range|invalid argument|range/i.test(msg)) {
      const err = new Error(`Tab "${b.sheet_tab}" was not found. Click Find tabs again and pick from the list. (${String(msg).slice(0, 200)})`);
      err.status = 400;
      return next(err);
    }
    next(new Error('Import failed: ' + msg));
  }
});

// LIST with counts.
router.get('/', (req, res) => {
  const all = db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all().map((c) => {
    const s = db.prepare("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status").all(c.id);
    const counts = { pending: 0, queued: 0, sent: 0, failed: 0, skipped: 0 };
    for (const r of s) counts[r.status] = r.n;
    return { ...c, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  res.json({ campaigns: all });
});

// DETAIL + recipients page.
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  const st = req.query.status || '';
  const page = Math.max(1, Number(req.query.page || 1));
  let where = 'campaign_id=?', params = [c.id];
  if (['pending', 'queued', 'sent', 'failed', 'skipped'].includes(st)) { where += ' AND status=?'; params.push(st); }
  const total = db.prepare(`SELECT COUNT(*) n FROM recipients WHERE ${where}`).get(...params).n;
  const people = db.prepare(`SELECT id,email,name,status,sent_at,error_message FROM recipients WHERE ${where} ORDER BY id LIMIT 50 OFFSET ?`).all(...params, (page - 1) * 50);
  res.json({ campaign: c, recipients: people, total, page });
});

// Send TEST email to myself (first row rendered).
router.post('/:id/test', async (req, res, next) => {
  const auth = getClient(res); if (!auth) return;
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  try {
    const sample = db.prepare('SELECT * FROM recipients WHERE campaign_id=? ORDER BY id LIMIT 1').get(c.id);
    const data = sample ? { ...JSON.parse(sample.data_json), email: sample.email, name: sample.name } : { name: 'there' };
    const subj = renderTemplate(c.subject, data);
    const html = renderTemplate(c.body_html, data) + `<br/><br/>---<br/><small>${c.footer}</small>`;
    const msgId = await sendEmail(auth.client, auth.email, '[TEST] ' + subj, html, auth.email);
    logEvent(c.id, null, 'test', 'Test sent to ' + auth.email);
    res.json({ ok: true, messageId: msgId, to: auth.email });
  } catch (e) { next(new Error('Test send failed: ' + e.message)); }
});

module.exports = router;
