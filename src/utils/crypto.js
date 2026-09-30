// AES-256-CBC lock for Google refresh tokens. Format "ivHex:encHex".
const crypto = require('crypto');
const config = require('../config');
function getKey() {
  const k = config.encryptionKey || '';
  if (Buffer.byteLength(k, 'utf8') !== 32) {
    throw new Error('ENCRYPTION_KEY must be EXACTLY 32 characters in .env');
  }
  return Buffer.from(k, 'utf8');
}
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  return iv.toString('hex') + ':' + (c.update(String(text), 'utf8', 'hex') + c.final('hex'));
}
function decrypt(payload) {
  const [ivHex, enc] = String(payload).split(':');
  if (!ivHex || !enc) throw new Error('Bad encrypted format');
  const d = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivHex, 'hex'));
  return d.update(enc, 'hex', 'utf8') + d.final('utf8');
}
module.exports = { encrypt, decrypt };
