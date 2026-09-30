// Report routes: view JSON, CSV, printable, Drive upload, email, retry-failed.
const express = require('express');
const db = require('../db');
const { decrypt } = require('../utils/crypto');
const { clientFromTokens } = require('../services/googleAuth');
const rep = require('../services/reportService');
const router = express.Router();

function getClient(res) {
  const acc = db.prepare('SELECT * FROM accounts ORDER BY id LIMIT 1').get();
  if (!acc) { res.status(401).json({ error: 'Connect Google first.' }); return null; }
  try {
    return { client: clientFromTokens(JSON.parse(decrypt(acc.tokens_encrypted))), email: acc.email };
  } catch (e) { res.status(500).json({ error: 'Login broken. Reconnect Google.' }); return null; }
}

// History of all campaigns (Reports page).
router.get('/', (req, res) => {
  const all = db.prepare('SELECT id, name, status, sheet_tab, started_at, finished_at FROM campaigns ORDER BY id DESC').all().map((c) => {
    const s = db.prepare("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status").all(c.id);
    const counts = { sent: 0, failed: 0 }; let total = 0;
    for (const r of s) { total += r.n; if (counts[r.status] !== undefined) counts[r.status] = r.n; }
    return { ...c, total, ...counts };
  });
  res.json({ reports: all });
});

router.get('/:id', (req, res) => {
  try { res.json(rep.getReport(req.params.id)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
router.get('/:id/csv', (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="business-mail-sender-${req.params.id}.csv"`);
    res.send(rep.buildCsv(req.params.id));
  } catch (e) { res.status(404).json({ error: e.message }); }
});
router.get('/:id/print', (req, res) => {
  try { res.setHeader('Content-Type', 'text/html; charset=utf-8').send(rep.buildPrintableHtml(req.params.id)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
router.post('/:id/drive', async (req, res, next) => {
  const a = getClient(res); if (!a) return;
  try { res.json({ ok: true, file: await rep.uploadToDrive(a.client, req.params.id) }); }
  catch (e) { next(new Error('Drive upload failed: ' + e.message)); }
});
router.post('/:id/email', async (req, res, next) => {
  const a = getClient(res); if (!a) return;
  try { await rep.emailSummary(a.client, a.email, req.params.id); res.json({ ok: true, to: a.email }); }
  catch (e) { next(new Error('Email report failed: ' + e.message)); }
});
router.post('/:id/retry-failed', (req, res) => {
  try { res.json({ ok: true, newId: rep.retryFailedCampaign(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
