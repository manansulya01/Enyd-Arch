import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMessageBody } from '../src/server/auth/message-content';

test('normalizes Windows and legacy newline sequences', () => {
  assert.equal(normalizeMessageBody(' first\r\nsecond\rthird '), 'first\nsecond\nthird');
});

test('trims content and enforces the message size limit', () => {
  assert.equal(normalizeMessageBody('  hello  '), 'hello');
  assert.equal(normalizeMessageBody('x'.repeat(5), 3), 'xxx');
});

test('rejects malformed runtime values without throwing', () => {
  assert.equal(normalizeMessageBody(null), '');
  assert.equal(normalizeMessageBody(42), '');
});
