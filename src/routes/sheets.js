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

function googleStatus(e) {
  return e?.code ?? e?.status ?? e?.response?.status ?? e?.response?.data?.error?.code ?? null;
}

function googleMessage(e) {
  const m = e?.response?.data?.error?.message || e?.message || String(e || '');
  return m;
}

// Turn cryptic Google errors into plain-English next steps.
function friendlySheetsError(e, action, id, tab) {
  const status = Number(googleStatus(e) || 0);
  const msg = googleMessage(e);
  const detail = msg.slice(0, 200);
  if (status === 404 || /not.?found|requested entity was not found/i.test(msg)) {
    const err = new Error(
      `Sheet not found (ID ${id || '?'}). 1) Paste the full link like https://docs.google.com/spreadsheets/d/ID/edit. ` +
      `2) Open that link in this browser — if Google asks for access, request it. ` +
      `3) Click Share in Sheets and add your sender Gmail as Viewer, then click Find tabs again. (${detail})`
    );
    err.status = 404;
    return err;
  }
  if (status === 403 || /permission|forbidden|access|insufficient/i.test(msg)) {
    const err = new Error(
      `No access to this sheet. Share it with your sender Gmail (Sheets Share button → Viewer), ` +
      `or open the link once while signed in as the sender, then try again. ` +
      `If scopes changed, go to Home → Connect Gmail and sign in again. (${detail})`
    );
    err.status = 403;
    return err;
  }
  if (status === 401 || /invalid credential|invalid_grant|unauthorized|login/i.test(msg)) {
    const err = new Error(`Google login expired. Go to Home → Connect Gmail and sign in again. (${detail})`);
    err.status = 401;
    return err;
  }
  if (status === 429 || /quota|rate.?limit|too many/i.test(msg)) {
    const err = new Error(`Google rate limit — wait a minute and try again. (${detail})`);
    err.status = 429;
    return err;
  }
  if (/unable to parse range|invalid argument|invalid value|range/i.test(msg)) {
    const err = new Error(
      tab ? `Tab "${tab}" was not found. Click Find tabs again and pick from the list (names must match exactly, including spaces). (${detail})`
          : `Invalid sheet range. Click Find tabs again and pick from the list. (${detail})`
    );
    err.status = 400;
    return err;
  }
  return new Error(`${action}: ${msg}`);
}

const BAD_LINK_HINT = 'That doesn\'t look like a Google Sheet link. Paste the full link (https://docs.google.com/spreadsheets/d/.../edit) or the ID between /d/ and /edit.';

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
  const raw = req.query.sheetId || '';
  const id = extractSheetId(raw);
  if (!id) return res.status(400).json({ error: BAD_LINK_HINT });
  try { res.json({ tabs: await listTabs(c, id) }); }
  catch (e) { next(friendlySheetsError(e, 'Could not list tabs', id, '')); }
});

// Preview: headers, sample 10, counts (total/valid/invalid/duplicates).
router.post('/preview', async (req, res, next) => {
  const c = getClient(res); if (!c) return;
  const id = extractSheetId(req.body.sheetId || '');
  const tab = (req.body.tab || '').trim();
  if (!id) return res.status(400).json({ error: BAD_LINK_HINT });
  if (!tab) return res.status(400).json({ error: 'Click Find tabs first, then pick a tab from the list.' });
  try {
    const { headers, rows } = await readTab(c, id, tab);
    const { valid, invalid, duplicates } = dedupEmails(rows);
    res.json({
      headers, total: rows.length, validCount: valid.length, invalid, duplicates,
      sample: rows.slice(0, 10).map((r) => ({ email: r._email, name: r._name, row: r._row, ok: isEmail(r._email) })),
    });
  } catch (e) { next(friendlySheetsError(e, 'Could not read sheet', id, tab)); }
});

module.exports = router;
