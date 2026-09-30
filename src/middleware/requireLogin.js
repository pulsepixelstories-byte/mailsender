// Access control for the whole app.
// ------------------------------------------------------------
// Two layers:
// 1. APP LOGIN (local users table, admin/user roles): protects every
//    page and every /api route. Login = session.userId + matching user row.
// 2. GMAIL CONNECTION (Google OAuth tokens in accounts table): only says
//    which sender address is connected. Needed for sending/sheets.
// ------------------------------------------------------------
const db = require('../db');

function sessionUserId(req) {
  return req.session ? req.session.userId || null : null;
}

function currentUser(req) {
  const id = sessionUserId(req);
  if (!id) return null;
  return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) || null;
}

function isLoggedIn(req) {
  return Boolean(currentUser(req));
}

function isAdmin(req) {
  const u = currentUser(req);
  return Boolean(u && u.role === 'admin');
}

// Use BEFORE express.static for protected *.html pages.
function requireLoginPage(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.redirect('/');
}

// Use BEFORE /api routers (JSON 401, no redirect).
function requireApiLogin(req, res, next) {
  if (isLoggedIn(req)) {
    req.user = currentUser(req);
    return next();
  }
  res.status(401).json({ error: 'Please log in first.' });
}

// Admin-only APIs (user management). 403 for plain users.
function requireAdmin(req, res, next) {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admins only.' });
  }
  req.user = currentUser(req);
  next();
}

// Has ANY Gmail been connected? (for friendly "connect first" hints)
function googleConnected() {
  return Boolean(db.prepare('SELECT email FROM accounts ORDER BY id LIMIT 1').get());
}

module.exports = { currentUser, isLoggedIn, isAdmin, requireLoginPage, requireApiLogin, requireAdmin, googleConnected };
