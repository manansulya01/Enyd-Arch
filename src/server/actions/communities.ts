'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { communityMembers, communityPostComments, communityPosts, communities, users } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrfValue } from '~/server/csrf';

function cleanText(value: string, max: number): string {
  return value.replace(/\r\n/g, '\n').replace(/[<>]/g, '').trim().slice(0, max);
}

function makeSlug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export async function createCommunity(input: {
  name: string;
  description: string;
  csrf: string;
}): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community creation is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before creating another community.');

  const name = cleanText(input.name, 80);
  const description = cleanText(input.description, 500);
  const slug = makeSlug(name);
  if (name.length < 3 || !slug) return fail('Use a community name with at least three letters or numbers.');

  try {
    const created = await db.transaction(async (tx) => {
      const [community] = await tx.insert(communities).values({
        name, description, slug, ownerId: actor.userId, isPrivate: false,
      }).returning({ id: communities.id, slug: communities.slug });
      if (!community) throw new Error('Community creation failed');
      await tx.insert(communityMembers).values({
        communityId: community.id, userId: actor.userId, role: 'owner',
      });
      return community;
    });
    revalidatePath('/communities');
    return ok({ slug: created.slug });
  } catch {
    return fail('Could not create that community. Its name may already be in use.');
  }
}

export async function joinCommunity(communityId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community membership is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before joining another community.');
  const [community] = await db.select({ id: communities.id, isPrivate: communities.isPrivate })
    .from(communities).innerJoin(users, eq(users.id, communities.ownerId))
    .where(and(eq(communities.id, communityId), isNull(users.removedAt), eq(users.status, 'active')))
    .limit(1);
  if (!community || community.isPrivate) return fail('That community is not available to join.');
  await db.insert(communityMembers).values({ communityId, userId: actor.userId, role: 'member' }).onConflictDoNothing();
  revalidatePath('/communities');
  return ok();
}

export async function leaveCommunity(communityId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community membership is not available for this identity.');
  const [membership] = await db.select({ role: communityMembers.role }).from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, actor.userId)))
    .limit(1);
  if (!membership) return fail('You are not a member of that community.');
  if (membership.role === 'owner') return fail('Transfer ownership before leaving your community.');
  await db.delete(communityMembers).where(and(
    eq(communityMembers.communityId, communityId),
    eq(communityMembers.userId, actor.userId),
  ));
  revalidatePath('/communities');
  return ok();
}

export async function createCommunityPost(input: {
  communityId: string;
  title: string;
  body: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Posting is not available for this identity.');
  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) return fail('You are posting too quickly. Wait a moment.');
  const title = cleanText(input.title, 160);
  const body = cleanText(input.body, 5000);
  if (!body) return fail('Write something before publishing.');
  const [membership] = await db.select({ communityId: communityMembers.communityId })
    .from(communityMembers).innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(and(
      eq(communityMembers.communityId, input.communityId),
      eq(communityMembers.userId, actor.userId),
      eq(communities.isPrivate, false),
    )).limit(1);
  if (!membership) return fail('Join this community before posting.');
  await db.insert(communityPosts).values({
    communityId: input.communityId,
    authorId: actor.userId,
    title: title || null,
    body,
  });
  revalidatePath('/communities');
  return ok();
}


export async function createCommunityComment(input: {
  postId: string;
  body: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Commenting is not available for this identity.');
  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) return fail('You are commenting too quickly. Wait a moment.');

  const body = cleanText(input.body, 2500);
  if (!body) return fail('Write a comment before publishing.');

  const [target] = await db.select({ postId: communityPosts.id, communityId: communityPosts.communityId, slug: communities.slug })
    .from(communityPosts)
    .innerJoin(communities, eq(communities.id, communityPosts.communityId))
    .innerJoin(communityMembers, and(
      eq(communityMembers.communityId, communityPosts.communityId),
      eq(communityMembers.userId, actor.userId),
    ))
    .where(and(
      eq(communityPosts.id, input.postId),
      eq(communityPosts.status, 'published'),
      isNull(communityPosts.removedAt),
      eq(communities.isPrivate, false),
    ))
    .limit(1);
  if (!target) return fail('Join the community and choose an available discussion before commenting.');

  await db.insert(communityPostComments).values({
    postId: target.postId,
    authorId: actor.userId,
    body,
  });
  revalidatePath('/communities');
  revalidatePath(`/communities/${target.slug}`);
  return ok();
}

export async function removeCommunityComment(commentId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing discussion comments.');

  const [comment] = await db.select({
    id: communityPostComments.id,
    authorId: communityPostComments.authorId,
    postId: communityPosts.id,
    communityId: communities.id,
    slug: communities.slug,
  })
    .from(communityPostComments)
    .innerJoin(communityPosts, eq(communityPosts.id, communityPostComments.postId))
    .innerJoin(communities, eq(communities.id, communityPosts.communityId))
    .where(and(
      eq(communityPostComments.id, commentId),
      eq(communityPostComments.status, 'published'),
      isNull(communityPostComments.removedAt),
      eq(communityPosts.status, 'published'),
      isNull(communityPosts.removedAt),
    ))
    .limit(1);
  if (!comment) return fail('That comment is no longer available.');

  const [membership] = await db.select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(
      eq(communityMembers.communityId, comment.communityId),
      eq(communityMembers.userId, actor.userId),
    ))
    .limit(1);
  const canModerate = membership?.role === 'owner' || membership?.role === 'moderator';
  if (comment.authorId !== actor.userId && !canModerate) {
    return fail('Only the author or a community moderator can remove this comment.');
  }

  await db.update(communityPostComments).set({
    status: 'removed',
    removedAt: new Date(),
  }).where(and(
    eq(communityPostComments.id, comment.id),
    eq(communityPostComments.status, 'published'),
    isNull(communityPostComments.removedAt),
  ));
  revalidatePath('/communities');
  revalidatePath(`/communities/${comment.slug}`);
  return ok();
}
