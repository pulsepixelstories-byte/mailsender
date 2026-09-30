// Express app entry. Binds localhost only (never public internet).
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
require('./db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1); // Apache XAMPP -> Node
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: config.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
}));

app.use('/auth', require('./routes/auth'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/sends', require('./routes/sends'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api', require('./routes/meta'));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(errorHandler);

if (require.main === module) {
  // Local laptop: localhost only (private). Live host (Render/VPS):
  // NODE_ENV=production listens on all interfaces + host's PORT.
  const live = process.env.NODE_ENV === 'production';
  const host = live ? '0.0.0.0' : '127.0.0.1';
  app.listen(config.port, host, () => {
    console.log(`Business Mail Sender at http://${host}:${config.port}`);
  });
}
module.exports = app;
