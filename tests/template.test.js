// Tests: {{placeholder}} rendering with |default fallback.
const { test } = require('node:test');
const assert = require('node:assert');
const { renderTemplate, listPlaceholders } = require('../src/utils/template');

test('replaces name and company', () => {
  assert.strictEqual(renderTemplate('Hi {{name}} at {{company}}', { name: 'Asha', company: 'Acme' }), 'Hi Asha at Acme');
});
test('missing value falls back to default', () => {
  assert.strictEqual(renderTemplate('Hi {{name|there}}', {}), 'Hi there');
});
test('missing without default becomes empty', () => {
  assert.strictEqual(renderTemplate('Hi {{name}}!', {}), 'Hi !');
});
test('case-insensitive keys', () => {
  assert.strictEqual(renderTemplate('{{Name}}', { name: 'Bo' }), 'Bo');
});
test('lists placeholders', () => {
  assert.deepStrictEqual(listPlaceholders('{{name}} {{company}}').sort(), ['company', 'name']);
});
