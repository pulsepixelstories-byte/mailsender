// Reports: summary, CSV, printable HTML, Drive upload, email-to-self.
const { google } = require('googleapis');
const db = require('../db');
const { reportsFolderId } = require('./driveService');
const { sendEmail } = require('./gmailService');

function getReport(campaignId) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  const sender = db.prepare('SELECT email FROM accounts ORDER BY id LIMIT 1').get();
  const rows = db.prepare("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status").all(campaignId);
  const byStatus = { pending: 0, queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) byStatus[r.status] = r.n;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const rate = total ? Math.round((byStatus.sent / total) * 100) : 0;
  let secs = null;
  if (campaign.started_at && campaign.finished_at) {
    secs = Math.round((new Date(campaign.finished_at) - new Date(campaign.started_at)) / 1000);
  }
  const people = db.prepare('SELECT name, email, status, sent_at, gmail_message_id, error_message FROM recipients WHERE campaign_id=? ORDER BY id LIMIT 2000').all(campaignId);
  const events = db.prepare('SELECT event, detail, created_at FROM send_log WHERE campaign_id=? ORDER BY id DESC LIMIT 100').all(campaignId);
  return {
    campaign, senderEmail: sender?.email || '', total, byStatus, successRate: rate,
    durationSec: secs, people, events,
    settings: { mode: campaign.mode, daily_cap: campaign.daily_cap, window: campaign.window_enabled ? `${campaign.window_start}-${campaign.window_end} ${campaign.window_tz}` : 'off' },
  };
}

function buildCsv(campaignId) {
  const { people } = getReport(campaignId);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['name,email,status,sent_at,gmail_message_id,error',
    ...people.map((p) => [esc(p.name), esc(p.email), esc(p.status), esc(p.sent_at), esc(p.gmail_message_id), esc(p.error_message)].join(','))].join('\n');
}

// Printable HTML doubles as "PDF" (browser Print -> Save as PDF).
function buildPrintableHtml(campaignId) {
  const r = getReport(campaignId);
  const rows = r.people.map((p) => `<tr><td>${p.name || ''}</td><td>${p.email}</td><td>${p.status}</td><td>${p.sent_at || ''}</td><td>${p.gmail_message_id || ''}</td><td>${p.error_message || ''}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report - ${r.campaign.name}</title>
<style>body{font-family:sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px;font-size:12px}</style></head>
<body><h1>${r.campaign.name}</h1>
<p>Sender: ${r.senderEmail} | Sheet: ${r.campaign.sheet_tab} | ${r.campaign.started_at || ''} to ${r.campaign.finished_at || ''}</p>
<p>Total ${r.total}, sent ${r.byStatus.sent}, failed ${r.byStatus.failed}, skipped ${r.byStatus.skipped}, rate ${r.successRate}%</p>
<table><tr><th>Name</th><th>Email</th><th>Status</th><th>Sent at</th><th>Gmail ID</th><th>Error</th></tr>${rows}</table>
<script>window.print && 0</script></body></html>`;
}

async function uploadToDrive(oauthClient, campaignId) {
  const r = getReport(campaignId);
  const folderId = await reportsFolderId(oauthClient);
  const drive = google.drive({ version: 'v3', auth: oauthClient });
  const csv = buildCsv(campaignId);
  const res = await drive.files.create({
    requestBody: { name: `Business Mail Sender - ${r.campaign.name} - report.csv`, parents: [folderId], mimeType: 'text/csv' },
    media: { mimeType: 'text/csv', body: Buffer.from(csv, 'utf8') },
    fields: 'id, webViewLink',
  });
  return res.data;
}

async function emailSummary(oauthClient, senderEmail, campaignId) {
  const r = getReport(campaignId);
  const html = `<h2>Business Mail Sender report: ${r.campaign.name}</h2>
<p>Sent ${r.byStatus.sent}/${r.total} (${r.successRate}%). Failed ${r.byStatus.failed}, skipped ${r.byStatus.skipped}.</p>
<p>Full table: open Reports in the app. CSV attached to Drive as "Business Mail Sender Reports".</p>`;
  return sendEmail(oauthClient, senderEmail, `Report: ${r.campaign.name} (${r.byStatus.sent}/${r.total} sent)`, html, senderEmail);
}

// New campaign from failed recipients only.
function retryFailedCampaign(campaignId) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId);
  if (!c) throw new Error('Not found');
  const failed = db.prepare("SELECT * FROM recipients WHERE campaign_id=? AND status='failed'").all(campaignId);
  if (!failed.length) throw new Error('No failed recipients to retry');
  const r = db.prepare(`INSERT INTO campaigns (name, sheet_id, sheet_tab, email_col, col_map_json, subject, body_html, footer, write_back, mode,
    min_delay_sec, max_delay_sec, batch_size, batch_delay_min_sec, batch_delay_max_sec, batch_pause_min, daily_cap, cap_action)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    c.name + ' (retry failed)', c.sheet_id, c.sheet_tab, c.email_col, c.col_map_json, c.subject, c.body_html,
    c.footer, c.write_back, c.mode, c.min_delay_sec, c.max_delay_sec, c.batch_size,
    c.batch_delay_min_sec, c.batch_delay_max_sec, c.batch_pause_min, c.daily_cap, c.cap_action);
  const ins = db.prepare("INSERT OR IGNORE INTO recipients (campaign_id, email, name, data_json) VALUES (?,?,?,?)");
  const tx = db.transaction((list) => { for (const p of list) ins.run(r.lastInsertRowid, p.email, p.name, p.data_json); });
  tx(failed);
  return r.lastInsertRowid;
}

module.exports = { getReport, buildCsv, buildPrintableHtml, uploadToDrive, emailSummary, retryFailedCampaign };
