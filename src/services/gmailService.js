// Gmail send via API. Sanitizes HTML first (XSS-safe bulk mail).
const { google } = require('googleapis');
const sanitizeHtml = require('sanitize-html');
const { buildMime } = require('../utils/mime');

function cleanHtml(dirty) {
  return sanitizeHtml(String(dirty || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'u']),
    allowedAttributes: { a: ['href'], '*': ['style'] },
  });
}
async function sendEmail(oauthClient, to, subject, htmlBody, fromEmail, opts = {}) {
  const safe = cleanHtml(htmlBody);
  const raw = buildMime({
    to, from: fromEmail, senderName: opts.senderName || '', replyTo: opts.replyTo || fromEmail,
    subject, html: safe,
  });
  const res = await google.gmail({ version: 'v1', auth: oauthClient }).users.messages.send({
    userId: 'me', requestBody: { raw },
  });
  return res.data.id || '';
}
module.exports = { sendEmail, cleanHtml };
