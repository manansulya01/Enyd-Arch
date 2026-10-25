import assert from 'node:assert/strict';
import test from 'node:test';
import { isUuid } from '../src/server/auth/identifiers';

test('UUID validator accepts canonical UUIDs and rejects malformed runtime inputs', () => {
  assert.equal(isUuid('123e4567-e89b-42d3-a456-426614174000'), true);
  for (const value of ['', 'member-1', '123e4567-e89b-42d3-a456-42661417400z', null, 42, {}, '123e4567-e89b-02d3-a456-426614174000']) {
    assert.equal(isUuid(value), false, String(value));
  }
});
