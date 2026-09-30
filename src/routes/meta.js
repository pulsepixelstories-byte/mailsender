// Dashboard (today's count vs cap) + global settings.
const express = require('express');
const db = require('../db');
const { sentToday } = require('../services/sendEngine');
const router = express.Router();

router.get('/dashboard', (req, res) => {
  const acc = db.prepare('SELECT email FROM accounts ORDER BY id LIMIT 1').get();
  const cap = Number(db.prepare("SELECT value FROM settings WHERE key='daily_cap'").get()?.value || 400);
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY id DESC LIMIT 10').all().map((c) => {
    const s = db.prepare("SELECT status, COUNT(*) n FROM recipients WHERE campaign_id=? GROUP BY status").all(c.id);
    const counts = { pending: 0, sent: 0, failed: 0, skipped: 0, queued: 0 };
    for (const r of s) counts[r.status] = r.n;
    return { ...c, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  res.json({ email: acc?.email || null, sentToday: sentToday(), dailyCap: cap, campaigns });
});

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});
router.post('/settings', (req, res) => {
  const allowed = ['daily_cap', 'sender_name', 'footer'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === 'daily_cap' && (Number(req.body[k]) < 1 || Number(req.body[k]) > 2000)) {
        return res.status(400).json({ error: 'Daily cap must be 1-2000' });
      }
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, String(req.body[k]));
    }
  }
  res.json({ ok: true });
});

module.exports = router;
