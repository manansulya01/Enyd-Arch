/**
 * Post-push bootstrap DDL.
 *
 * Drizzle-kit owns the tables. This file owns the handful of objects it cannot
 * express: the member-number sequence, full-text search indexes, and the
 * trigger that keeps `updated_at` honest.
 *
 *   pnpm db:push && pnpm db:bootstrap
 */
import { sql } from './index.js';

const statements: string[] = [
  // Membership numbers start at 1 so the first identity is ARCH-000001.
  `CREATE SEQUENCE IF NOT EXISTS member_id_seq AS integer START WITH 1 OWNED BY users.member_id`,

  // ── Full text search ─────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS posts_body_fts_idx
     ON posts USING gin (to_tsvector('english', coalesce(body, '')))`,
  `CREATE INDEX IF NOT EXISTS comments_body_fts_idx
     ON comments USING gin (to_tsvector('english', coalesce(body, '')))`,
  `CREATE INDEX IF NOT EXISTS archive_title_fts_idx
     ON archive_objects USING gin (to_tsvector('english',
          coalesce(title,'') || ' ' || coalesce(description,'')))`,
  `CREATE INDEX IF NOT EXISTS games_title_fts_idx
     ON games USING gin (to_tsvector('english',
          coalesce(title,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(description,'')))`,
  `CREATE INDEX IF NOT EXISTS gallery_title_fts_idx
     ON gallery_title_fts_base USING gin (to_tsvector('english',
          coalesce(title,'') || ' ' || coalesce(caption,'')))`.replace(
    'gallery_title_fts_base',
    'gallery_posts',
  ),
  `CREATE INDEX IF NOT EXISTS users_username_trgm_idx
     ON users USING gin (to_tsvector('simple', coalesce(username,'') || ' ' || coalesce(display_name,'')))`,

  // ── Timestamp maintenance ────────────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION enyd_touch_updated_at() RETURNS trigger AS $$
   BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql`,
];

const touchedTables = [
  'users',
  'profiles',
  'user_settings',
  'archive_objects',
  'collections',
  'gallery_posts',
  'matches',
  'connection_preferences',
  'platform_settings',
  'reports',
  'film_reviews',
];

let failures = 0;

for (const statement of statements) {
  try {
    await sql.unsafe(statement);
    console.log('  ok  ', statement.slice(0, 68).replace(/\s+/g, ' '));
  } catch (error) {
    failures += 1;
    console.error('  FAIL', statement.slice(0, 68).replace(/\s+/g, ' '));
    console.error('      ', (error as Error).message);
  }
}

for (const table of touchedTables) {
  try {
    await sql.unsafe(`DROP TRIGGER IF EXISTS ${table}_touch_updated_at ON ${table}`);
    await sql.unsafe(
      `CREATE TRIGGER ${table}_touch_updated_at BEFORE UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION enyd_touch_updated_at()`,
    );
    console.log('  ok   trigger', table);
  } catch (error) {
    failures += 1;
    console.error('  FAIL trigger', table, (error as Error).message);
  }
}

await sql.end();
if (failures > 0) {
  console.error(`\nbootstrap completed with ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nbootstrap complete');