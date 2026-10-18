import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptObject, encryptObject } from '../src/server/storage/envelope';

test('stored objects are encrypted and round-trip through authenticated decryption', () => {
  process.env.STORAGE_ENCRYPTION_KEY = 'test-only-storage-key-with-at-least-32-chars';
  const plaintext = new TextEncoder().encode('private archive content');
  const encrypted = encryptObject(plaintext);
  assert.notDeepEqual(encrypted, plaintext);
  const decoded = decryptObject(encrypted);
  assert.equal(decoded.encrypted, true);
  assert.deepEqual(decoded.data, plaintext);
});

test('encrypted object authentication rejects modified ciphertext', () => {
  process.env.STORAGE_ENCRYPTION_KEY = 'test-only-storage-key-with-at-least-32-chars';
  const encrypted = encryptObject(new TextEncoder().encode('private message attachment'));
  encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 0x01;
  assert.throws(() => decryptObject(encrypted));
});

test('encrypted objects cannot be opened with a different storage key', () => {
  process.env.STORAGE_ENCRYPTION_KEY = 'test-only-storage-key-with-at-least-32-chars';
  const encrypted = encryptObject(new TextEncoder().encode('secret'));
  process.env.STORAGE_ENCRYPTION_KEY = 'different-test-storage-key-with-at-least-32-chars';
  assert.throws(() => decryptObject(encrypted));
});

test('legacy plaintext objects are identified for checksum-verified migration', () => {
  const plaintext = new TextEncoder().encode('pre-encryption object');
  const decoded = decryptObject(plaintext);
  assert.equal(decoded.encrypted, false);
  assert.deepEqual(decoded.data, plaintext);
});
