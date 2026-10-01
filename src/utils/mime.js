// Strip CR/LF to block header injection, trim, cap length.
function sanitizeHeader(v, max = 998) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

// Encode a display name if it has non-ASCII / quotes.
function encodeDisplayName(name) {
  const clean = sanitizeHeader(name, 200);
  if (!clean) return '';
  if (/^[\x20-\x7E]*$/.test(clean) && !/["<>]/.test(clean)) return clean;
  return '=?UTF-8?B?' + Buffer.from(clean, 'utf8').toString('base64') + '?=';
}

// Derive a display name from the email address itself:
// john.doe@gmail.com -> John Doe, info@shop.com -> Info.
function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const words = local.replace(/[_.\-+]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return String(email || '');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 200);
}
function base64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function htmlToText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
function buildMime({ to, from, senderName, subject, html }) {
  const boundary = 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const safeTo = sanitizeHeader(to);
  const safeFrom = sanitizeHeader(from);
  const encSubj = '=?UTF-8?B?' + Buffer.from(String(subject ?? ''), 'utf8').toString('base64') + '?=';
  const text = htmlToText(html);
  // Sender name comes from the email itself; no custom headers.
  // Gmail adds Date, Message-ID, DKIM etc. on send.
  const namePart = encodeDisplayName(senderName || displayNameFromEmail(safeFrom));
  const fromHeader = namePart ? `${namePart} <${safeFrom}>` : safeFrom;
  const lines = [
    `To: ${safeTo}`, `From: ${fromHeader}`, `Subject: ${encSubj}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}--`,
  ];
  return base64Url(lines.join('\r\n'));
}
module.exports = { buildMime, htmlToText, base64Url, sanitizeHeader, encodeDisplayName, displayNameFromEmail };
