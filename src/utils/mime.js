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

function messageId(domain) {
  const d = sanitizeHeader(domain || 'gmail.com', 100).replace(/[^a-zA-Z0-9.-]/g, '') || 'gmail.com';
  const rand = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  return `<${rand}@${d}>`;
}
function base64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function htmlToText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
function buildMime({ to, from, senderName, replyTo, subject, html, unsubscribeMailto }) {
  const boundary = 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const safeTo = sanitizeHeader(to);
  const safeFrom = sanitizeHeader(from);
  const safeReply = sanitizeHeader(replyTo || from);
  const fromDomain = (safeFrom.split('@')[1] || 'gmail.com');
  const encSubj = '=?UTF-8?B?' + Buffer.from(String(subject ?? ''), 'utf8').toString('base64') + '?=';
  const text = htmlToText(html);
  const namePart = encodeDisplayName(senderName);
  const fromHeader = namePart ? `${namePart} <${safeFrom}>` : safeFrom;
  // One-click unsubscribe (mailto) satisfies Gmail bulk-sender rules when
  // sending similar mail to many recipients. Mail client shows "Unsubscribe".
  const unsub = sanitizeHeader(unsubscribeMailto || `mailto:${safeFrom}?subject=unsubscribe`);
  const lines = [
    `To: ${safeTo}`, `From: ${fromHeader}`, `Reply-To: ${safeReply}`, `Subject: ${encSubj}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: ${messageId(fromDomain)}`,
    `List-Unsubscribe: <${unsub}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
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
module.exports = { buildMime, htmlToText, base64Url, sanitizeHeader, encodeDisplayName };
