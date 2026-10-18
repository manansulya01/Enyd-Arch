import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCapabilities } from '../src/server/auth/capabilities';
import { buildKey } from '../src/server/storage/keys';

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
