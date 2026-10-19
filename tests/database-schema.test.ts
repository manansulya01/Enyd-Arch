import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { sql as client } from '../db/index';

after(async () => {
  await client.end({ timeout: 5 });
});

test('CI PostgreSQL schema contains the security-critical and music tables', async () => {
  const rows = await client`
    select
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') as users_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sessions') as sessions_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'blocks') as blocks_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversations') as conversations_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversation_members') as members_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'storage_objects') as objects_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'files') as files_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rate_limits') as rate_limits_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'music_playlists') as music_playlists_table,
      exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'music_playlist_tracks') as music_playlist_tracks_table
  `;
  const schema = rows[0];
  assert.ok(schema);
  for (const name of [
    'users_table',
    'sessions_table',
    'blocks_table',
    'conversations_table',
    'members_table',
    'objects_table',
    'files_table',
    'rate_limits_table',
    'music_playlists_table',
    'music_playlist_tracks_table',
  ] as const) {
    assert.equal(schema[name], true, `missing expected table: ${name}`);
  }
});
