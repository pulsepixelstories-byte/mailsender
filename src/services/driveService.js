// Drive: list user's spreadsheets (metadata readonly).
const { google } = require('googleapis');
async function listSpreadsheets(oauthClient, search = '') {
  let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  if (search.trim()) q += ` and name contains '${String(search).replace(/'/g, "\\'")}'`;
  const res = await google.drive({ version: 'v3', auth: oauthClient }).files.list({
    q, orderBy: 'modifiedTime desc', pageSize: 50, fields: 'files(id, name, modifiedTime)',
  });
  return res.data.files || [];
}
// Find or create the "Business Mail Sender Reports" folder, return its id.
async function reportsFolderId(oauthClient) {
  const drive = google.drive({ version: 'v3', auth: oauthClient });
  const found = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='Business Mail Sender Reports' and trashed=false",
    fields: 'files(id)', pageSize: 1,
  });
  if (found.data.files.length) return found.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: 'Business Mail Sender Reports', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id;
}
module.exports = { listSpreadsheets, reportsFolderId };
