// Sheets API: list Drive sheets, tabs, 10-row preview with counts.
// All routes need Google connected (401 otherwise).
const express = require('express');
const db = require('../db');
const { decrypt } = require('../utils/crypto');
const { clientFromTokens } = require('../services/googleAuth');
const { listSpreadsheets } = require('../services/driveService');
const { listTabs, readTab } = require('../services/sheetsService');
const { extractSheetId, dedupEmails, isEmail } = require('../utils/validators');
const router = express.Router();

function getClient(res) {
  const acc = db.prepare('SELECT * FROM accounts ORDER BY id LIMIT 1').get();
  if (!acc) { res.status(401).json({ error: 'Google not connected. Sign in first.' }); return null; }
  try {
    return clientFromTokens(JSON.parse(decrypt(acc.tokens_encrypted)));
  } catch (e) {
    res.status(500).json({ error: 'Saved login broken (' + e.message + '). Reconnect Google.' });
    return null;
  }
}

router.get('/files', async (req, res, next) => {
  const c = getClient(res); if (!c) return;
  try { res.json({ files: await listSpreadsheets(c, req.query.search || '') }); }
  catch (e) { next(e); }
});

router.get('/tabs', async (req, res, next) => {
  const c = getClient(res); if (!c) return;
  const id = extractSheetId(req.query.sheetId || '');
  if (!id) return res.status(400).json({ error: 'sheetId required' });
  try { res.json({ tabs: await listTabs(c, id) }); }
  catch (e) { next(new Error('Could not list tabs: ' + e.message)); }
});

// Preview: headers, sample 10, counts (total/valid/invalid/duplicates).
router.post('/preview', async (req, res, next) => {
  const c = getClient(res); if (!c) return;
  const id = extractSheetId(req.body.sheetId || '');
  const tab = req.body.tab || '';
  if (!id || !tab) return res.status(400).json({ error: 'sheetId and tab required' });
  try {
    const { headers, rows } = await readTab(c, id, tab);
    const { valid, invalid, duplicates } = dedupEmails(rows);
    res.json({
      headers, total: rows.length, validCount: valid.length, invalid, duplicates,
      sample: rows.slice(0, 10).map((r) => ({ email: r._email, name: r._name, row: r._row, ok: isEmail(r._email) })),
    });
  } catch (e) { next(new Error('Could not read sheet: ' + e.message)); }
});

module.exports = router;
