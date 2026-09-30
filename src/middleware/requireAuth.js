// Blocks pages/APIs when Google is not connected.
const db = require('../db');
function requireAuth(req, res, next) {
  const acc = db.prepare('SELECT email FROM accounts ORDER BY id LIMIT 1').get();
  if (!acc) return res.status(401).json({ error: 'Google not connected. Go to Login and click "Sign in with Google".' });
  req.accountEmail = acc.email;
  next();
}
module.exports = requireAuth;
