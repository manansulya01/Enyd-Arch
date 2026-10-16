'use server';

/** Browser surface for the Arcade. */
import { redirect } from 'next/navigation';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { commentOnGame, rateGame, recordPlay, submitGame } from './arcade';

export async function onRecordPlay(gameId: string, seconds: number): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) return fail('Sign in to record plays.');
  return recordPlay(gameId, seconds);
}

export async function onRateGame(gameId: string, stars: number): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  return rateGame(gameId, stars);
}

export async function onSubmitGame(
  input: {
    title: string;
    tagline: string;
    description: string;
    genre: string;
    controls: string;
    tags: string;
  },
  file: File,
  csrf: string,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const formData = new FormData();
  formData.set('__csrf', csrf);
  formData.set('title', input.title);
  formData.set('tagline', input.tagline);
  formData.set('description', input.description);
  formData.set('genre', input.genre);
  formData.set('controls', input.controls);
  formData.set('tags', input.tags);
  formData.set('package', file);
  return submitGame(null, formData);
}

export async function onCommentOnGame(
  input: { gameId: string; body: string; csrf: string; parentId: string | null },
): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const formData = new FormData();
  formData.set('__csrf', input.csrf);
  formData.set('gameId', input.gameId);
  formData.set('body', input.body);
  if (input.parentId) {
    formData.set('parentId', input.parentId);
  }
  await verifyCsrf(formData);
  return commentOnGame(null, formData);
}
