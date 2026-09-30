// Send controls: start/pause/resume/cancel + live status + confirm info.
// Idempotent: starting twice does not double-send (UNIQUE + status checks).
const express = require('express');
const db = require('../db');
const { runCampaign, liveState } = require('../services/sendEngine');
const { estimateTotalSec } = require('../utils/scheduler');
const { logEvent } = require('../utils/logger');
const router = express.Router();

// Confirm info BEFORE launch: ETA + counts (Step 5 dialog uses this).
router.get('/:id/confirm', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const pending = db.prepare("SELECT COUNT(*) n FROM recipients WHERE campaign_id=? AND status='pending'").get(c.id).n;
  res.json({ pending, etaSec: estimateTotalSec(pending, c), mode: c.mode, dry: !!c.dry_run, cap: c.daily_cap });
});

router.post('/:id/start', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (c.status === 'running') return res.json({ ok: true, status: 'running' });
  if (!['draft', 'paused', 'failed'].includes(c.status)) return res.status(400).json({ error: `Cannot start from "${c.status}"` });
  const pending = db.prepare("SELECT COUNT(*) n FROM recipients WHERE campaign_id=? AND status IN ('pending','queued')").get(c.id).n;
  if (!pending) return res.status(400).json({ error: 'Nobody left to send to' });
  db.prepare("UPDATE campaigns SET status='running', started_at=COALESCE(started_at, datetime('now')) WHERE id=?").run(c.id);
  logEvent(c.id, null, 'start', 'Launched by user');
  runCampaign(c.id);
  res.json({ ok: true, status: 'running' });
});
router.post('/:id/pause', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE campaigns SET status='paused' WHERE id=? AND status='running'").run(c.id);
  logEvent(c.id, null, 'pause', 'Paused by user');
  res.json({ ok: true, status: 'paused' });
});
router.post('/:id/resume', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (c.status !== 'paused') return res.status(400).json({ error: `Cannot resume from "${c.status}"` });
  db.prepare("UPDATE campaigns SET status='running' WHERE id=?").run(c.id);
  logEvent(c.id, null, 'resume', 'Resumed by user');
  runCampaign(c.id);
  res.json({ ok: true, status: 'running' });
});
router.post('/:id/cancel', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE recipients SET status='skipped' WHERE campaign_id=? AND status IN ('pending','queued')").run(c.id);
  db.prepare("UPDATE campaigns SET status='cancelled', finished_at=datetime('now') WHERE id=?").run(c.id);
  logEvent(c.id, null, 'cancel', 'Cancelled by user');
  res.json({ ok: true, status: 'cancelled' });
});

// Live polling endpoint (every 3s from live.html).
router.get('/:id/status', (req, res) => {
  const s = liveState(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const events = db.prepare('SELECT event, detail, created_at FROM send_log WHERE campaign_id=? ORDER BY id DESC LIMIT 30').all(req.params.id);
  res.json({ ...s, events });
});

module.exports = router;
