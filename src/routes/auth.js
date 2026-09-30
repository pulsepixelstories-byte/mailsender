// Auth routes: login, callback, status, disconnect.
const express = require('express');
const db = require('../db');
const config = require('../config');
const googleAuth = require('../services/googleAuth');
const { encrypt } = require('../utils/crypto');
const { info, error } = require('../utils/logger');
const router = express.Router();

// Start: "Sign in with Google" button links here.
router.get('/google', (req, res) => {
  if (!googleAuth.isConfigured()) {
    return res.status(500).send('Google login not set up. Paste GOOGLE_CLIENT_ID + SECRET into .env, then restart.');
  }
  const redirectUri = googleAuth.redirectUriForRequest(req);
  req.session.oauthRedirectUri = redirectUri;
  info('OAuth start:', redirectUri);
  res.redirect(googleAuth.getAuthUrl(redirectUri));
});

// Google returns here with ?code=. Save encrypted refresh token.
router.get('/google/callback', async (req, res) => {
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

// Frontend polls this for button state.
// connected = a Gmail is saved. loggedIn = THIS browser signed in.
router.get('/status', (req, res) => {
  const acc = db.prepare('SELECT email, created_at FROM accounts ORDER BY id LIMIT 1').get();
  const { isLoggedIn } = require('../middleware/requireLogin');
  res.json({
    configured: googleAuth.isConfigured(),
    connected: Boolean(acc),
    email: acc?.email || null,
    loggedIn: isLoggedIn(req),
    sessionEmail: req.session.accountEmail || null,
  });
});

// Log out THIS browser only (keeps the saved Gmail for others).
router.post('/logout', (req, res) => {
  req.session.accountEmail = null;
  info('Browser logged out');
  res.json({ ok: true });
});

// Disconnect: delete saved tokens (browser session kept, must reconnect).
router.post('/disconnect', (req, res) => {
  db.prepare('DELETE FROM accounts').run();
  req.session.accountEmail = null;
  info('Google disconnected by user');
  res.json({ ok: true });
});

module.exports = router;
