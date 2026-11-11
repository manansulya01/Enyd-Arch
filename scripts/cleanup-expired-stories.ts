import { lt } from 'drizzle-orm';
import { db, sql } from '../db/index';
import { stories } from '../db/schema';
import { storyPurgeCutoff } from '../src/server/auth/story-retention';

/**
 * Purge text-only story rows seven days after expiry.
 *
 * Stories stop being visible at expiresAt. The additional seven-day retention
 * window allows operational recovery while keeping ephemeral content from
 * accumulating indefinitely. story_views are removed by the schema FK cascade.
 * Schedule this command from a trusted private cron/worker, never an HTTP route.
 */
async function main(): Promise<void> {
  const cutoff = storyPurgeCutoff();
  const removed = await db.delete(stories)
    .where(lt(stories.expiresAt, cutoff))
    .returning({ id: stories.id });

  process.stdout.write(`Expired story cleanup: ${removed.length} stories purged.\\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Expired story cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}\\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
