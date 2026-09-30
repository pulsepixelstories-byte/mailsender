// Read Google Sheets: tabs, rows. First row = headers.
const { google } = require('googleapis');
const { detectEmailColumn } = require('../utils/validators');

async function listTabs(oauthClient, spreadsheetId) {
  const meta = await google.sheets({ version: 'v4', auth: oauthClient }).spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets || []).map((s) => s.properties.title);
}

// Returns { headers, rows, emailIdx }. Each row: {col: val, _email, _name, _row}.
async function readTab(oauthClient, spreadsheetId, tabName) {
  const res = await google.sheets({ version: 'v4', auth: oauthClient }).spreadsheets.values.get({
    spreadsheetId, range: tabName,
  });
  const values = res.data.values || [];
  if (values.length < 2) return { headers: values[0] || [], rows: [], emailIdx: -1 };
  const headers = values[0].map((h) => String(h || '').trim());
  const emailIdx = detectEmailColumn(headers);
  const nameIdx = headers.findIndex((h) => String(h).toLowerCase() === 'name');
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const cells = values[i];
    if (!cells || cells.every((c) => !String(c ?? '').trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h || `col${idx + 1}`] = cells[idx] !== undefined ? String(cells[idx]) : ''; });
    const emailCol = emailIdx >= 0 ? cells[emailIdx] : cells[0];
    obj._email = String(emailCol || '').trim();
    obj._name = nameIdx >= 0 ? String(cells[nameIdx] || '').trim() : '';
    obj._row = i + 1;
    rows.push(obj);
  }
  return { headers, rows, emailIdx };
}

// Write Status / Sent At / Error back into the sheet (checkbox setting).
async function writeBack(oauthClient, spreadsheetId, tabName, headers, updates) {
  // updates: [{row, status, sentAt, error}]. Ensure columns exist first.
  const sheets = google.sheets({ version: 'v4', auth: oauthClient });
  const wanted = ['Status', 'Sent At', 'Error'];
  const missing = wanted.filter((w) => !headers.map((h) => h.toLowerCase()).includes(w.toLowerCase()));
  if (missing.length) {
    // Append missing headers at end of header row.
    const startCol = String.fromCharCode(65 + headers.length) + '1';
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tabName}!${startCol}`,
      valueInputOption: 'RAW', requestBody: { values: [missing] },
    });
    headers = headers.concat(missing);
  }
  const idx = (n) => headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const sIdx = idx('Status'), tIdx = idx('Sent At'), eIdx = idx('Error');
  const colLetter = (i) => String.fromCharCode(65 + i);
  const data = updates.map((u) => ([
    { range: `${tabName}!${colLetter(sIdx)}${u.row}`, values: [[u.status]] },
    { range: `${tabName}!${colLetter(tIdx)}${u.row}`, values: [[u.sentAt || '']] },
    { range: `${tabName}!${colLetter(eIdx)}${u.row}`, values: [[u.error || '']] },
  ])).flat();
  if (!data.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
}

module.exports = { listTabs, readTab, writeBack };
