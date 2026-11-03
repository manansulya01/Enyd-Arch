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

async function verify(csrfToken: string): Promise<void> {
  const formData = new FormData();
  formData.set('__csrf', csrfToken);
  await verifyCsrf(formData);
}

async function actor() {
  const resolved = await currentActor();
  if (!resolved) redirect('/sign-in');
  return resolved;
}

export async function onCreatePost(input: Parameters<typeof createPost>[1], csrfToken: string) {
  await verify(csrfToken);
  return createPost(await actor(), input);
}

export async function onCreateComment(input: Parameters<typeof createComment>[1], csrfToken: string) {
  await verify(csrfToken);
  return createComment(await actor(), input);
}

export async function onDeleteComment(commentId: string, csrfToken: string) {
  await verify(csrfToken);
  return deleteComment(await actor(), commentId);
}

export async function onToggleReaction(input: Parameters<typeof toggleReaction>[1], csrfToken: string) {
  await verify(csrfToken);
  return toggleReaction(await actor(), input);
}

export async function onVoteInPoll(input: Parameters<typeof voteInPoll>[1], csrfToken: string) {
  await verify(csrfToken);
  return voteInPoll(await actor(), input);
}

export async function onToggleBookmark(input: Parameters<typeof toggleBookmark>[1], csrfToken: string) {
  await verify(csrfToken);
  return toggleBookmark(await actor(), input);
}

export async function onRepost(postId: string, csrfToken: string) {
  await verify(csrfToken);
  return repostPost(await actor(), postId);
}

export { verifyCsrf };
export type { ActionResult };
