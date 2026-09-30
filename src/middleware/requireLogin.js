// Login gate: no signed-in browser session -> no access.
// Logged in = this browser finished Google OAuth (session.accountEmail)
// AND that Gmail account still exists in the database.
// Two flavours: pages redirect to / (login), APIs answer 401 JSON.
const db = require('../db');

function sessionEmail(req) {
  return req.session ? req.session.accountEmail || null : null;
}

function isLoggedIn(req) {
  const email = sessionEmail(req);
  if (!email) return false;
  const acc = db.prepare('SELECT email FROM accounts WHERE email = ?').get(email);
  return Boolean(acc);
}

// Use BEFORE express.static for protected *.html pages.
function requireLoginPage(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.redirect('/');
}

// Use BEFORE /api routers.
function requireApiLogin(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.status(401).json({ error: 'Please sign in with Google first.' });
}

module.exports = { isLoggedIn, requireLoginPage, requireApiLogin };
