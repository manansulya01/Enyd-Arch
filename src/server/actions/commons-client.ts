'use server';

/**
 * Browser surface for The Commons. Core logic lives in ./commons and takes an
 * already-resolved actor; these wrappers resolve the session themselves so a
 * client can never impersonate another member.
 */
import { redirect } from 'next/navigation';
import { currentActor } from '~/server/auth/session';
import {
  createComment,
  createPost,
  deleteComment,
  repostPost,
  toggleBookmark,
  toggleReaction,
  voteInPoll,
} from './commons';
import { verifyCsrf } from '~/server/csrf';
import type { ActionResult } from '~/lib/action-result';

async function actor() {
  const resolved = await currentActor();
  if (!resolved) redirect('/sign-in');
  return resolved;
}

export async function onCreatePost(input: Parameters<typeof createPost>[1], csrfToken: string) {
  const formData = new FormData();
  formData.set('__csrf', csrfToken);
  await verifyCsrf(formData);
  return createPost(await actor(), input);
}

export async function onCreateComment(input: Parameters<typeof createComment>[1]) {
  return createComment(await actor(), input);
}

export async function onDeleteComment(commentId: string) {
  return deleteComment(await actor(), commentId);
}

export async function onToggleReaction(input: Parameters<typeof toggleReaction>[1]) {
  return toggleReaction(await actor(), input);
}

export async function onVoteInPoll(input: Parameters<typeof voteInPoll>[1]) {
  return voteInPoll(await actor(), input);
}

export async function onToggleBookmark(input: Parameters<typeof toggleBookmark>[1]) {
  return toggleBookmark(await actor(), input);
}

export async function onRepost(postId: string) {
  return repostPost(await actor(), postId);
}

export { verifyCsrf };
export type { ActionResult };
