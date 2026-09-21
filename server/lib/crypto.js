const crypto = require('crypto');

// Algorithm definition
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from the environment ENCRYPTION_KEY or JWT_SECRET
 */
function getMasterKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'vaani-default-secret-key-change-in-production';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plain text string using AES-256-GCM
 * @param {string} text Plain text to encrypt
 * @returns {string} Encrypted string in format: iv:ciphertext:authTag (hex)
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string
 * @param {string} encryptedText Encrypted string in format: iv:ciphertext:authTag
 * @returns {string} Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // If not in the encrypted format, return as is (could be legacy/fallback plain text)
    return encryptedText;
  }
  
  try {
    const [ivHex, ciphertext, tagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return encryptedText;
  }
}

/**
 * Masks a sensitive key for display in UI (e.g., "••••••••ab12")
 * @param {string} key 
 * @returns {string} Masked string
 */
function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const lastFour = trimmed.slice(-4);
  return `••••••••${lastFour}`;
}

module.exports = {
  encrypt,
  decrypt,
  maskKey
};
