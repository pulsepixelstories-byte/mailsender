// Tests: email check, dedup, sheet-ID parsing, column detection.
const { test } = require('node:test');
const assert = require('node:assert');
const { isEmail, extractSheetId, dedupEmails, detectEmailColumn } = require('../src/utils/validators');

test('accepts good emails, rejects bad', () => {
  assert.ok(isEmail('a@b.com'));
  assert.ok(!isEmail('not-an-email'));
  assert.ok(!isEmail('a@b'));
  assert.ok(!isEmail(''));
});
test('extracts ID from full Sheets URL', () => {
  assert.strictEqual(extractSheetId('https://docs.google.com/spreadsheets/d/ABC123/edit'), 'ABC123');
  assert.strictEqual(extractSheetId('ABC123'), 'ABC123');
});
test('dedups case-insensitive, counts invalid', () => {
  const r = dedupEmails([{ _email: 'A@x.com' }, { _email: 'a@X.com' }, { _email: 'bad' }, { _email: '' }]);
  assert.strictEqual(r.valid.length, 1);
  assert.strictEqual(r.duplicates, 1);
  assert.strictEqual(r.invalid, 2);
});
test('auto-detects email column', () => {
  assert.strictEqual(detectEmailColumn(['Name', 'Email', 'Co']), 1);
  assert.strictEqual(detectEmailColumn(['Name', 'E-mail']), 1);
  assert.strictEqual(detectEmailColumn(['Name', 'Co']), -1);
});
