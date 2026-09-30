// Auth routes: LOCAL app login (admin/user roles) + Google sender connection.
// ------------------------------------------------------------
// App access:  POST /auth/setup-admin (first user only, becomes admin)
//              POST /auth/login  -> browser session (7 days)
//              POST /auth/logout -> forget this browser
// Gmail sender: GET /auth/google, /auth/google/callback (login required)
//               POST /auth/disconnect (admin only - affects everyone)
// ------------------------------------------------------------
const express = require('express');
const db = require('../db');
const config = require('../config');
const googleAuth = require('../services/googleAuth');
const { encrypt } = require('../utils/crypto');
const { hashPassword, verifyPassword } = require('../utils/password');
const { info, error } = require('../utils/logger');
const gate = require('../middleware/requireLogin');
const router = express.Router();

// Is this a fresh install with no users yet?
function needsSetup() {
  return !db.prepare('SELECT id FROM users LIMIT 1').get();
}

// First visitor creates the admin account (only works when users table is empty).
router.post('/setup-admin', (req, res) => {
  if (!needsSetup()) return res.status(403).json({ error: 'Admin already exists. Ask your admin for an account.' });
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  try {
    if (!name) return res.status(400).json({ error: 'Name required.' });
    if (!email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
    const r = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(name, email, hashPassword(req.body.password));
    req.session.userId = Number(r.lastInsertRowid);
    req.session.userRole = 'admin';
    info('First admin created:', email);
    res.json({ ok: true, role: 'admin' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'That email is taken.' });
    res.status(400).json({ error: e.message });
  }
});

// Local login (email + password).
router.post('/login', (req, res) => {
  if (needsSetup()) return res.status(403).json({ error: 'No accounts yet. Create the admin account first.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !verifyPassword(req.body.password || '', u.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  req.session.userId = u.id;
  req.session.userRole = u.role;
  info('Login:', email);
  res.json({ ok: true, role: u.role, name: u.name });
});

// Log out THIS browser.
router.post('/logout', (req, res) => {
  req.session.userId = null;
  req.session.userRole = null;
  info('Browser logged out');
  res.json({ ok: true });
});

// Who am I? (login page + nav bars use this)
router.get('/status', (req, res) => {
  const acc = db.prepare('SELECT email, created_at FROM accounts ORDER BY id LIMIT 1').get();
  const me = gate.currentUser(req);
  res.json({
    needsSetup: needsSetup(),
    loggedIn: Boolean(me),
    role: me ? me.role : null,
    userName: me ? me.name : null,
    userEmail: me ? me.email : null,
    googleConfigured: googleAuth.isConfigured(),
    googleConnected: Boolean(acc),
    googleEmail: acc ? acc.email : null,
  });
});

// Start Google connect (must be logged into the app first).
router.get('/google', gate.requireApiLogin, (req, res) => {
  if (!googleAuth.isConfigured()) {
    return res.status(500).send('Google login not set up. Paste GOOGLE_CLIENT_ID + SECRET into .env, then restart.');
  }
  const redirectUri = googleAuth.redirectUriForRequest(req);
  req.session.oauthRedirectUri = redirectUri;
  info('OAuth start:', redirectUri);
  res.redirect(googleAuth.getAuthUrl(redirectUri));
});

// Google returns here with ?code=. Only works right after /google (same browser).
router.get('/google/callback', gate.requireApiLogin, async (req, res) => {
  try {
    if (!req.query.code) return res.status(400).send('Google did not return a code. Try again.');
    const redirectUri = req.session.oauthRedirectUri || config.google.redirectUri;
    const tokens = await googleAuth.exchangeCode(req.query.code, redirectUri);
    const email = await googleAuth.getAccountEmail(googleAuth.clientFromTokens(tokens));
    db.prepare(`INSERT INTO accounts (email, tokens_encrypted) VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET tokens_encrypted=excluded.tokens_encrypted`)
      .run(email, encrypt(JSON.stringify(tokens)));
    req.session.accountEmail = email;
    info('Connected:', email);
    res.redirect('/?connected=1');
  } catch (e) {
    error('OAuth callback:', e.message);
    // Clear hint for revoked/blocked access.
    res.status(500).send('Google sign-in failed: ' + String(e.message).slice(0, 300) +
      '. If it says access denied, click Sign in again (Reconnect Google).');
  }
});

// Disconnect Gmail sender (admin only - affects everyone).
router.post('/disconnect', gate.requireAdmin, (req, res) => {
  db.prepare('DELETE FROM accounts').run();
  info('Gmail disconnected by admin');
  res.json({ ok: true });
});

module.exports = router;
