'use server';

import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { blocks, stories, storyViews, userFollows, users } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrfValue } from '~/server/csrf';
import { isUuid } from '~/server/auth/identifiers';
import { mayViewStory } from '~/server/auth/story-policy';

function storyText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/[<>]/g, '').trim().slice(0, 600);
}

export async function createStory(input: {
  body: string;
  audience: 'followers' | 'mutuals' | 'public';
  csrf: string;
}): Promise<ActionResult<{ storyId: string }>> {
  await verifyCsrfValue(input?.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Stories are not available for this identity.');
  const body = storyText(input.body);
  if (!body) return fail('Write a short story before publishing.');
  if (!['followers', 'mutuals', 'public'].includes(input.audience)) return fail('Choose a valid story audience.');
  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) return fail('You are posting too quickly. Wait a moment.');

  const [story] = await db.insert(stories).values({
    authorId: actor.userId,
    body,
    audience: input.audience,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).returning({ id: stories.id });
  revalidatePath('/stories');
  return ok({ storyId: story!.id });
}

export async function removeStory(storyId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!isUuid(storyId)) return fail('That story is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before removing another story.');
  const [removed] = await db.update(stories).set({ removedAt: new Date() })
    .where(and(
      eq(stories.id, storyId),
      eq(stories.authorId, actor.userId),
      isNull(stories.removedAt),
    )).returning({ id: stories.id });
  if (!removed) return fail('Only the story owner can remove it.');
  revalidatePath('/stories');
  return ok();
}

export async function viewStory(storyId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!isUuid(storyId)) return fail('That story is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before opening another story.');

  const allowed = await db.transaction(async (tx) => {
    const [story] = await tx.select({
      id: stories.id,
      authorId: stories.authorId,
      audience: stories.audience,
    }).from(stories)
      .innerJoin(users, and(
        eq(users.id, stories.authorId),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ))
      .where(and(
        eq(stories.id, storyId),
        gt(stories.expiresAt, new Date()),
        isNull(stories.removedAt),
      )).for('update').limit(1);
    if (!story) return false;
    const [blocked] = story.authorId === actor.userId ? [undefined] : await tx.select({ id: blocks.id })
      .from(blocks).where(or(
        and(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, story.authorId)),
        and(eq(blocks.blockerId, story.authorId), eq(blocks.blockedId, actor.userId)),
      )).limit(1);
    const [follow] = story.authorId === actor.userId || story.audience === 'public'
      ? [undefined]
      : await tx.select({ followerId: userFollows.followerId })
        .from(userFollows).where(and(
          eq(userFollows.followerId, actor.userId),
          eq(userFollows.followedId, story.authorId),
        )).limit(1);
    const [followBack] = story.authorId === actor.userId || story.audience !== 'mutuals'
      ? [undefined]
      : await tx.select({ followerId: userFollows.followerId })
        .from(userFollows).where(and(
          eq(userFollows.followerId, story.authorId),
          eq(userFollows.followedId, actor.userId),
        )).limit(1);
    if (!mayViewStory({
      viewerId: actor.userId,
      authorId: story.authorId,
      audience: story.audience,
      blocked: Boolean(blocked),
      followsAuthor: Boolean(follow),
      followsViewer: Boolean(followBack),
    })) return false;
    await tx.insert(storyViews).values({
      storyId,
      viewerId: actor.userId,
    }).onConflictDoNothing();
    return true;
  });

  if (!allowed) return fail('That story is no longer available to this account.');
  revalidatePath('/stories');
  return ok();
}
