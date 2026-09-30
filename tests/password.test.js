// Tests: password hashing (scrypt) - correct accepts, wrong rejects.
const { test } = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword } = require('../src/utils/password');

test('hash then verify works', () => {
  const h = hashPassword('secret123');
  assert.ok(verifyPassword('secret123', h));
});
test('wrong password rejected', () => {
  const h = hashPassword('secret123');
  assert.ok(!verifyPassword('nope123', h));
});
test('short password refused', () => {
  assert.throws(() => hashPassword('123'), /at least 6/);
});
test('garbage hash never verifies', () => {
  assert.ok(!verifyPassword('x', 'not-a-hash'));
});
test('same password gives different hashes (random salt)', () => {
  assert.notStrictEqual(hashPassword('same123'), hashPassword('same123'));
});
