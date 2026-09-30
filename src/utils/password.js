// Password hashing with Node's built-in scrypt (no extra packages).
// Stored format: "saltHex:hashHex".
const crypto = require('crypto');

function hashPassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    // timingSafeEqual stops guessing attacks based on response speed.
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch (e) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
