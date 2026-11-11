import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_RETENTION_GRACE_MS, storyPurgeCutoff } from '../src/server/auth/story-retention';

test('expired stories receive a seven-day cleanup grace period', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  assert.equal(STORY_RETENTION_GRACE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(
    storyPurgeCutoff(now).toISOString(),
    '2026-11-04T12:00:00.000Z',
  );
});

test('cleanup cutoff is derived from the supplied clock, not mutated', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  const before = now.getTime();
  const cutoff = storyPurgeCutoff(now);
  assert.equal(now.getTime(), before);
  assert.ok(cutoff.getTime() < now.getTime());
});
