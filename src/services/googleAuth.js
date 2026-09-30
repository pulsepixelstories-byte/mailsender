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
// Works on ANY domain (laptop, Apache subpath, Hostinger, Render) without
// .env edits: uses the exact address the browser opened. That address must
// ALSO be registered in Google Console -> Authorized redirect URIs,
// or Google answers redirect_uri_mismatch.
function redirectUriForRequest(req) {
  const fallback = config.google.redirectUri;
  try {
    if (!req) return fallback;
    const host = (req.get('host') || '').split(',')[0].trim();
    if (!host) return fallback;
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const scheme = proto === 'https' ? 'https' : 'http';
    // Local Apache proxy serves the app under the /mail-sender/ subpath.
    if (host === 'localhost' || host.startsWith('localhost:80')) {
      return `${scheme}://localhost/mail-sender/auth/google/callback`;
    }
    return `${scheme}://${host}/auth/google/callback`;
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
