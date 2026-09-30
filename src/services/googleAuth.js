// Google OAuth2 helper. Scopes per spec (send + sheets R/W + drive).
const { google } = require('googleapis');
const config = require('../config');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];
function isConfigured() { return Boolean(config.google.clientId && config.google.clientSecret); }
function makeClient(redirectUri) {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, redirectUri || config.google.redirectUri);
}
// Support both :3001 and /mail-sender callback origins.
function redirectUriForRequest(req) {
  const fallback = config.google.redirectUri;
  try {
    const host = req.get('host') || '';
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
    if (host === 'localhost' || host.startsWith('localhost:80')) {
      return `${proto}://localhost/mail-sender/auth/google/callback`;
    }
  } catch (e) { /* fallback */ }
  return fallback;
}
function getAuthUrl(redirectUri) {
  return makeClient(redirectUri).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}
async function exchangeCode(code, redirectUri) {
  const { tokens } = await makeClient(redirectUri).getToken(code);
  return tokens;
}
function clientFromTokens(tokens) {
  const c = makeClient();
  c.setCredentials(tokens);
  return c;
}
async function getAccountEmail(oauthClient) {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauthClient });
    const p = await gmail.users.getProfile({ userId: 'me' });
    if (p.data.emailAddress) return p.data.emailAddress;
  } catch (e) { /* try userinfo */ }
  const me = await google.oauth2({ version: 'v2', auth: oauthClient }).userinfo.get();
  return me.data.email;
}
module.exports = { SCOPES, isConfigured, makeClient, redirectUriForRequest, getAuthUrl, exchangeCode, clientFromTokens, getAccountEmail };
