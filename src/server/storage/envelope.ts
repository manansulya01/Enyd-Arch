import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('ENYDOBJ1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const configured = process.env.STORAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('STORAGE_ENCRYPTION_KEY must be set to at least 32 characters in production.');
  }
  // Development fallback is deliberately local-only; production refuses to
  // start without a separately managed encryption secret.
  const secret = configured ?? 'enyd-arch-development-storage-key-not-for-production-use';
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** AES-256-GCM envelope. Authentication failure throws; corrupted data never falls back to plaintext. */
export function encryptObject(plaintext: Uint8Array): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

export function decryptObject(stored: Uint8Array): { data: Uint8Array; encrypted: boolean } {
  const buffer = Buffer.from(stored);
  if (buffer.length < MAGIC.length || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    // Backwards compatibility for files written before the at-rest envelope.
    // The caller verifies their stored checksum and opportunistically rewraps.
    return { data: new Uint8Array(buffer), encrypted: false };
  }

  const minimum = MAGIC.length + IV_BYTES + TAG_BYTES;
  if (buffer.length < minimum) throw new Error('Encrypted object envelope is truncated.');
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const iv = buffer.subarray(ivStart, tagStart);
  const tag = buffer.subarray(tagStart, ciphertextStart);
  const ciphertext = buffer.subarray(ciphertextStart);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return { data: new Uint8Array(plaintext), encrypted: true };
}
