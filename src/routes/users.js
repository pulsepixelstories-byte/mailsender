// User management - ADMIN ONLY (wired with requireAdmin in server.js).
// ------------------------------------------------------------
// GET    /api/users      list all (no password hashes sent)
// POST   /api/users      add user {name, email, password, role}
// DELETE /api/users/:id remove user (not yourself, not the last admin)
// POST   /api/users/me/password  logged-in user changes OWN password
// ------------------------------------------------------------
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { info } = require('../utils/logger');
const { requireAdmin, requireApiLogin } = require('../middleware/requireLogin');
const router = express.Router();

// Everyone logged in can change their OWN password.
router.post('/me/password', requireApiLogin, (req, res) => {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(req.body.current || '', me.password_hash)) {
    return res.status(400).json({ error: 'Current password is wrong.' });
  }
  try {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(req.body.next), me.id);
    info('Password changed for:', me.email);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- admin only below ---
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id').all();
  res.json({ users });
});

router.post('/', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  try {
    if (!name) return res.status(400).json({ error: 'Name required.' });
    if (!email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
    const r = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(req.body.password), role);
    info(`Admin ${req.user.email} added user:`, email, `(${role})`);
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That email is taken.' });
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself.' });
  }
  if (target.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;
    if (Number(admins) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin.' });
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  info(`Admin ${req.user.email} removed user:`, target.email);
  res.json({ ok: true });
});

module.exports = router;
