import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { sql } from '../db/index';
import { putObject, readObject, removeObject } from '../src/server/storage/driver';

const createdIds: string[] = [];

after(async () => {
  for (const id of createdIds) await removeObject(id);
  await sql.end({ timeout: 5 });
});

test('storage pipeline persists ciphertext and returns verified plaintext to authorized callers', async () => {
  process.env.STORAGE_ENCRYPTION_KEY = 'ci-only-storage-encryption-key-0123456789';
  const plaintext = new TextEncoder().encode('private object integration test');
  const stored = await putObject({
    purpose: 'upload',
    id: randomUUID(),
    extension: 'txt',
    data: plaintext,
    contentType: 'text/plain',
  });
  createdIds.push(stored.id);

  const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? './storage');
  const raw = new Uint8Array(await readFile(path.join(root, stored.objectKey)));
  assert.equal(new TextDecoder().decode(raw.subarray(0, 8)), 'ENYDOBJ1');
  assert.notDeepEqual(raw, plaintext);

  const restored = await readObject(stored.id);
  assert.ok(restored);
  assert.deepEqual(restored.data, plaintext);
  assert.equal(restored.byteSize, plaintext.byteLength);
  assert.equal(restored.contentType, 'text/plain');
});
