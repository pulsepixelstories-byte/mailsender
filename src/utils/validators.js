// Email validation, dedup, sheet-ID parsing. Pure functions (tested).
function isEmail(v) {
  if (!v || typeof v !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
// Accept raw ID or full Sheets URL (also Drive open?id= links).
function extractSheetId(input) {
  let s = String(input || '').trim();
  // Strip wrapping quotes/brackets users sometimes copy from chat apps.
  s = s.replace(/^[\s<>"'(\[]+|[\s<>"')\].,;]+$/g, '').trim();
  if (!s) return '';
  const dMatch = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (dMatch) return dMatch[1];
  const idParam = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (idParam) return idParam[1];
  // Bare ID (no URL parts, no spaces). Google IDs are long, but keep
  // short values working for tests/back-compat.
  if (/^[a-zA-Z0-9-_]+$/.test(s)) return s;
  return '';
}
// Remove duplicates case-insensitive, skip blanks/invalid. Returns {valid, invalid, duplicates}.
function dedupEmails(rows, emailKey = '_email') {
  const seen = new Set();
  const valid = [];
  let invalid = 0, duplicates = 0;
  for (const r of rows) {
    const e = String(r[emailKey] || '').trim().toLowerCase();
    if (!isEmail(e)) { invalid++; continue; }
    if (seen.has(e)) { duplicates++; continue; }
    seen.add(e);
    valid.push({ ...r, _email: e });
  }
  return { valid, invalid, duplicates };
}
// Auto-detect email column from headers (email/e-mail/mail).
function detectEmailColumn(headers) {
  const lower = headers.map((h) => String(h).toLowerCase().trim());
  let i = lower.findIndex((h) => h === 'email');
  if (i >= 0) return i;
  i = lower.findIndex((h) => h === 'e-mail' || h === 'mail');
  if (i >= 0) return i;
  i = lower.findIndex((h) => h.includes('mail'));
  return i; // -1 if none
}
module.exports = { isEmail, extractSheetId, dedupEmails, detectEmailColumn };
