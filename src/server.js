// Express app entry. Binds localhost only (never public internet).
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
require('./db');
const errorHandler = require('./middleware/errorHandler');
const { requireLoginPage, requireApiLogin } = require('./middleware/requireLogin');

const app = express();
app.set('trust proxy', 1); // Apache XAMPP -> Node
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: config.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
}));

app.use('/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));

// Auth gate: everything below needs a signed-in browser session.
// Login page (/), /health and /auth/* stay public.
const GATED_PAGES = [
  '/dashboard.html', '/wizard.html', '/live.html',
  '/reports.html', '/report.html', '/settings.html', '/users.html',
  '/connect.html',
];
app.get(GATED_PAGES, requireLoginPage);
app.use('/api', requireApiLogin);

app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/sends', require('./routes/sends'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api', require('./routes/meta'));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(errorHandler);

if (require.main === module) {
  // Listen on all interfaces so hosts (Hostinger Web Apps, Render, VPS)
  // can route traffic to us. Locally this still opens http://localhost:PORT.
  // Hosts provide their own PORT env var - we respect it via config.
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Business Mail Sender at http://localhost:${config.port}`);
  });
}
module.exports = app;
