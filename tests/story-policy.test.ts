import assert from 'node:assert/strict';
import test from 'node:test';
import { mayViewStory } from '../src/server/auth/story-policy';

const base = {
  viewerId: 'viewer',
  authorId: 'author',
  audience: 'followers' as const,
  blocked: false,
  followsAuthor: false,
  followsViewer: false,
};

test('an author can always view their own active story', () => {
  assert.equal(mayViewStory({ ...base, viewerId: 'author', blocked: true }), true);
});

test('a block in either direction denies another member story', () => {
  assert.equal(mayViewStory({ ...base, audience: 'public', blocked: true }), false);
});

test('public stories are visible to signed-in non-blocked members', () => {
  assert.equal(mayViewStory({ ...base, audience: 'public' }), true);
});

test('follower stories require the viewer to follow the author', () => {
  assert.equal(mayViewStory({ ...base, followsAuthor: false }), false);
  assert.equal(mayViewStory({ ...base, followsAuthor: true }), true);
});

test('mutual stories require both members to follow each other', () => {
  assert.equal(mayViewStory({ ...base, audience: 'mutuals', followsAuthor: true, followsViewer: false }), false);
  assert.equal(mayViewStory({ ...base, audience: 'mutuals', followsAuthor: false, followsViewer: true }), false);
  assert.equal(mayViewStory({ ...base, audience: 'mutuals', followsAuthor: true, followsViewer: true }), true);
});
