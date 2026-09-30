// RFC2822 MIME builder (pure, tested): HTML + plain-text alternative, UTF-8.
function base64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function htmlToText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
function buildMime({ to, from, subject, html }) {
  const boundary = 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const encSubj = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
  const text = htmlToText(html);
  const lines = [
    `To: ${to}`, `From: ${from}`, `Subject: ${encSubj}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    `--${boundary}--`,
  ];
  return base64Url(lines.join('\r\n'));
}
module.exports = { buildMime, htmlToText, base64Url };
