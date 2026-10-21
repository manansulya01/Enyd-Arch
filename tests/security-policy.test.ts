import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCapabilities } from '../src/server/auth/capabilities';
import { buildKey } from '../src/server/storage/keys';
import { mayInitiateMessage } from '../src/server/auth/messaging-policy';
import { coarseDeviceLabel, resolveClientIp } from '../src/server/crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildRateLimitIncrementSql } from '../src/server/auth/rate-limit';

test('inactive identities receive no capabilities', () => {
  assert.deepEqual(
    deriveCapabilities({
      status: 'suspended',
      level: 'inner_arch',
      isMinor: false,
      onboarded: true,
      restricted: [],
    }),
    [],
  );
});

test('unonboarded identities receive read-only capabilities even with elevated roles', () => {
  assert.deepEqual(
    deriveCapabilities({
      status: 'active',
      level: 'inner_arch',
      isMinor: false,
      onboarded: false,
      restricted: [],
    }),
    ['read'],
  );
});

test('minor identities never receive dating capability', () => {
  const capabilities = deriveCapabilities({
    status: 'active',
    level: 'member',
    isMinor: true,
    onboarded: true,
    restricted: [],
  });
  assert.ok(capabilities.includes('read'));
  assert.ok(capabilities.includes('message'));
  assert.ok(!capabilities.includes('connections_dating'));
});

test('restrictions remove only the named capability', () => {
  const capabilities = deriveCapabilities({
    status: 'active',
    level: 'member',
    isMinor: false,
    onboarded: true,
    restricted: ['message'],
  });
  assert.ok(!capabilities.includes('message'));
  assert.ok(capabilities.includes('post'));
  assert.ok(capabilities.includes('read'));
});

test('storage keys use fixed prefixes and UUID identifiers', () => {
  assert.equal(
    buildKey('upload', '123e4567-e89b-42d3-a456-426614174000', 'PNG'),
    'objects/12/123e4567-e89b-42d3-a456-426614174000.png',
  );
  assert.throws(
    () => buildKey('upload', '../../outside', 'txt'),
    /UUID/,
  );
});

test('message policy rejects self-messaging, inactive recipients, and blocked pairs', () => {
  const base = {
    senderId: 'sender',
    recipientId: 'recipient',
    recipientActive: true,
    messagePolicy: 'members',
    blocked: false,
    connected: false,
  };
  assert.equal(mayInitiateMessage({ ...base, recipientId: 'sender' }), false);
  assert.equal(mayInitiateMessage({ ...base, recipientActive: false }), false);
  assert.equal(mayInitiateMessage({ ...base, blocked: true }), false);
});

test('message policy respects nobody and connections-only recipient settings', () => {
  const base = {
    senderId: 'sender',
    recipientId: 'recipient',
    recipientActive: true,
    blocked: false,
    connected: false,
  };
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'nobody', connected: true }), false);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'connections' }), false);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'connections', connected: true }), true);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'members' }), true);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'unrecognised' }), false);
});

test('client IP resolution trusts only configured proxy hops', () => {
  assert.equal(resolveClientIp('203.0.113.10, 10.0.0.2', 1), '203.0.113.10');
  assert.equal(resolveClientIp('198.51.100.5, 203.0.113.10, 10.0.0.2', 1), '203.0.113.10');
  assert.equal(resolveClientIp('198.51.100.5, 203.0.113.10, 10.0.0.2', 2), '198.51.100.5');
  assert.equal(resolveClientIp('203.0.113.10, 10.0.0.2', 0), 'local');
  assert.equal(resolveClientIp('not-an-ip, 10.0.0.2', 1), 'local');
  assert.equal(resolveClientIp('10.0.0.2', 1), 'local');
});

test('connection restrictions remove only the matching connection mode', () => {
  const capabilities = deriveCapabilities({
    status: 'active',
    level: 'member',
    isMinor: false,
    onboarded: true,
    restricted: ['connect_friendship', 'connections_dating'],
  });
  assert.ok(!capabilities.includes('connect_friendship'));
  assert.ok(!capabilities.includes('connections_dating'));
  assert.ok(capabilities.includes('connect_collaboration'));
  assert.ok(capabilities.includes('connections'));
});


test('message policy fails closed for missing or future policy values', () => {
  const base = {
    senderId: 'sender',
    recipientId: 'recipient',
    recipientActive: true,
    blocked: false,
    connected: true,
  };
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: undefined }), false);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: null }), false);
  assert.equal(mayInitiateMessage({ ...base, messagePolicy: 'future-policy' }), false);
});



test('session device labels discard detailed user-agent fingerprints', () => {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36';
  assert.equal(coarseDeviceLabel(userAgent), 'Chrome on Windows');
  assert.ok(!coarseDeviceLabel(userAgent).includes('123.0.0.0'));
  assert.ok(!coarseDeviceLabel(userAgent).includes('Win64'));
});


test('rate-limit upsert writes timestamp expiry values, not bare intervals', () => {
  const query = new PgDialect().sqlToQuery(buildRateLimitIncrementSql('write:test:bucket', 60));
  assert.match(query.sql, /values \(\$1, 1, now\(\), now\(\) \+ make_interval\(secs => \$2\)\)/);
  assert.match(query.sql, /then now\(\) \+ make_interval\(secs => \$3\)/);
});
