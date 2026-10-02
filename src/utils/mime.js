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
function makeMessageId(domain) {
  const d = String(domain || 'gmail.com').replace(/[^a-zA-Z0-9.-]/g, '') || 'gmail.com';
  const rand = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  return `<${rand}@${d}>`;
}
function buildMime({ to, from, senderName, replyTo, subject, html, unsubscribeMailto, messageIdDomain, campaignId }) {
  const boundary = 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const safeTo = sanitizeHeader(to);
  const safeFrom = sanitizeHeader(from);
  const safeReplyTo = sanitizeHeader(replyTo || from);
  const encSubj = '=?UTF-8?B?' + Buffer.from(String(subject ?? ''), 'utf8').toString('base64') + '?=';
  const text = htmlToText(html);
  // Sender name comes from settings; falls back to the email itself.
  const namePart = encodeDisplayName(senderName || displayNameFromEmail(safeFrom));
  const fromHeader = namePart ? `${namePart} <${safeFrom}>` : safeFrom;
  const dateHeader = new Date().toUTCString();
  const fromDomain = (String(safeFrom).split('@')[1] || 'gmail.com').trim() || 'gmail.com';
  const messageId = makeMessageId(messageIdDomain || fromDomain);
  const lines = [
    `To: ${safeTo}`, `From: ${fromHeader}`, `Reply-To: ${safeReplyTo}`, `Subject: ${encSubj}`,
    `Date: ${dateHeader}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  // Yahoo/Gmail bulk-sender requirement (Feb 2024, strictly enforced by Yahoo):
  // List-Unsubscribe + one-click POST. Without these Yahoo returns
  // "554 5.7.9 message not accepted for policy reasons" or drops to spam.
  if (unsubscribeMailto) {
    const safeUnsub = sanitizeHeader(unsubscribeMailto, 300);
    lines.push(`List-Unsubscribe: <mailto:${safeUnsub}?subject=unsubscribe>`);
    lines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  // Mark as bulk so Yahoo/out-of-office loops don't reply-storm.
  lines.push('Precedence: bulk');
  lines.push('', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}--`);
  return base64Url(lines.join('\r\n'));
}
module.exports = { buildMime, htmlToText, base64Url, sanitizeHeader, encodeDisplayName, displayNameFromEmail, makeMessageId };
