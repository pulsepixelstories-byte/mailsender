// ============================================================
// config.js - Reads your ".env" private settings.
// You edit ".env", NEVER this file.
// ============================================================
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3001),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  // Spec name is ENCRYPTION_KEY (32 chars). Accept old TOKEN_ENCRYPTION_KEY too.
  encryptionKey: process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY || '',
};
