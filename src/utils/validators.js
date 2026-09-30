// Email validation, dedup, sheet-ID parsing. Pure functions (tested).
function isEmail(v) {
  if (!v || typeof v !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
// Accept raw ID or full Sheets URL.
function extractSheetId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
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
