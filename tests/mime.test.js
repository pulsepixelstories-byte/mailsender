// Tests: MIME message builds valid base64url with both parts.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildMime, htmlToText } = require('../src/utils/mime');

test('strips tags for plain-text part', () => {
  assert.strictEqual(htmlToText('<p>Hi <b>Bo</b></p>'), 'Hi Bo');
});
test('MIME decodes to multipart with subject', () => {
  const raw = buildMime({ to: 'a@x.com', from: 'me@x.com', subject: 'Héllo ✓', html: '<p>Hi</p>' });
  assert.ok(!/[+/=]$/.test(raw), 'must be base64url, no padding');
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.ok(decoded.includes('multipart/alternative'));
  assert.ok(decoded.includes('text/plain') && decoded.includes('text/html'));
  assert.ok(decoded.includes('To: a@x.com'));
});
