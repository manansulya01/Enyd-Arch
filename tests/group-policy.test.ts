import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_GROUP_MEMBERS_EXCLUDING_OWNER,
  normalizeGroupMembers,
} from '../src/server/auth/group-policy';

const owner = 'owner';
const members = (count: number) => Array.from({ length: count }, (_, index) => `member-${index}`);

test('group selection removes the owner and duplicate IDs', () => {
  assert.deepEqual(normalizeGroupMembers(owner, [owner, 'a', 'a', 'b']), {
    ok: true,
    memberIds: ['a', 'b'],
  });
});

test('group selection requires at least one other member', () => {
  assert.deepEqual(normalizeGroupMembers(owner, [owner, owner]), {
    ok: false,
    reason: 'Add at least one other member.',
  });
  assert.deepEqual(normalizeGroupMembers(owner, []), {
    ok: false,
    reason: 'Add at least one other member.',
  });
});

test('group selection permits at most 11 other members plus the owner', () => {
  const allowed = normalizeGroupMembers(owner, members(MAX_GROUP_MEMBERS_EXCLUDING_OWNER));
  assert.equal(allowed.ok, true);
  const rejected = normalizeGroupMembers(owner, members(MAX_GROUP_MEMBERS_EXCLUDING_OWNER + 1));
  assert.deepEqual(rejected, {
    ok: false,
    reason: 'A private group can have at most 12 members, including you.',
  });
});

test('group selection rejects malformed member identifiers', () => {
  assert.deepEqual(normalizeGroupMembers(owner, ['']), {
    ok: false,
    reason: 'One of those members is not available.',
  });
  assert.deepEqual(normalizeGroupMembers(owner, ['x'.repeat(101)]), {
    ok: false,
    reason: 'One of those members is not available.',
  });
});


test('group selection rejects non-string identifiers supplied at runtime', () => {
  assert.deepEqual(
    normalizeGroupMembers(owner, [null as unknown as string]),
    { ok: false, reason: 'One of those members is not available.' },
  );
  assert.deepEqual(
    normalizeGroupMembers(owner, [42 as unknown as string]),
    { ok: false, reason: 'One of those members is not available.' },
  );
});

