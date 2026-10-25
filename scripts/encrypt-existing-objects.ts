import 'server-only';
import { isNull } from 'drizzle-orm';
import { db, sql } from '../db/index';
import { storageObjects } from '../db/schema';
import { readObject } from '../src/server/storage/driver';

async function main(): Promise<void> {
  if (!process.env.STORAGE_ENCRYPTION_KEY || process.env.STORAGE_ENCRYPTION_KEY.length < 32) {
    throw new Error('Set STORAGE_ENCRYPTION_KEY (at least 32 characters) before migrating stored objects.');
  }

  const objects = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(isNull(storageObjects.removedAt));

  let verified = 0;
  let failed = 0;
  for (const object of objects) {
    // readObject validates the stored plaintext checksum and lazily wraps any
    // legacy plaintext bytes with AES-256-GCM before returning.
    const result = await readObject(object.id);
    if (!result) failed += 1;
    else verified += 1;
  }

  // Do not print names, keys, or file contents. IDs are intentionally omitted.
  process.stdout.write(`Stored-object encryption migration: ${verified} verified, ${failed} failed, ${objects.length} total.\n`);
  if (failed > 0) {
    throw new Error('Some stored objects could not be verified and migrated. Investigate before launch.');
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Storage encryption migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
