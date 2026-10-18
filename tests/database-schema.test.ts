import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { sql as client } from '../db/index';

after(async () => {
  await client.end({ timeout: 5 });
});

test('CI PostgreSQL schema contains the security-critical tables', async () => {
  const rows = await client`
    select
      to_regclass('public.users')::text as users_table,
      to_regclass('public.sessions')::text as sessions_table,
      to_regclass('public.blocks')::text as blocks_table,
      to_regclass('public.conversations')::text as conversations_table,
      to_regclass('public.conversation_members')::text as members_table,
      to_regclass('public.storage_objects')::text as objects_table,
      to_regclass('public.files')::text as files_table,
      to_regclass('public.rate_limits')::text as rate_limits_table
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
  ] as const) {
    assert.equal(typeof schema[name], 'string', `missing expected table: ${name}`);
  }
});
