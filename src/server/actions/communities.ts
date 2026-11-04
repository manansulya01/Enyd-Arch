'use server';

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { blocks, communityInvites, communityMembers, communityPostComments, communityPosts, communityPostVotes, communities, moderationActions, reports, users } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf, verifyCsrfValue } from '~/server/csrf';
import { isUuid } from '~/server/auth/identifiers';
import { auditFromSession } from '~/server/security/audit';

function cleanText(value: string, max: number): string {
  return value.replace(/\r\n/g, '\n').replace(/[<>]/g, '').trim().slice(0, max);
}

function makeSlug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export async function resolveCommunityReport(
  reportId: string,
  outcome: 'resolved' | 'dismissed',
  resolution: string,
  csrf: string,
): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Moderation is not available for this identity.');
  if (!isUuid(reportId) || !['resolved', 'dismissed'].includes(outcome)) return fail('That report is not available.');
  const note = typeof resolution === 'string' ? resolution.trim().slice(0, 2000) : '';
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before updating another report.');

  const resolved = await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(and(
      eq(reports.id, reportId),
      inArray(reports.state, ['open', 'triaged', 'investigating']),
    )).for('update').limit(1);
    if (!report || (report.targetType !== 'community_post' && report.targetType !== 'community_comment')) return null;

    let communityId: string | null = null;
    let slug: string | null = null;
    if (report.targetType === 'community_post') {
      const [target] = await tx.select({
        communityId: communityPosts.communityId,
        slug: communities.slug,
      }).from(communityPosts)
        .innerJoin(communities, eq(communities.id, communityPosts.communityId))
        .where(eq(communityPosts.id, report.targetId))
        .limit(1);
      communityId = target?.communityId ?? null;
      slug = target?.slug ?? null;
    } else {
      const [target] = await tx.select({
        communityId: communityPosts.communityId,
        slug: communities.slug,
      }).from(communityPostComments)
        .innerJoin(communityPosts, eq(communityPosts.id, communityPostComments.postId))
        .innerJoin(communities, eq(communities.id, communityPosts.communityId))
        .where(eq(communityPostComments.id, report.targetId))
        .limit(1);
      communityId = target?.communityId ?? null;
      slug = target?.slug ?? null;
    }
    if (!communityId || !slug) return null;
    const [membership] = await tx.select({ role: communityMembers.role })
      .from(communityMembers).where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, actor.userId),
      )).for('update').limit(1);
    if (membership?.role !== 'owner' && membership?.role !== 'moderator') return null;

    await tx.update(reports).set({
      state: outcome,
      resolution: note,
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reports.id, reportId));
    await tx.insert(moderationActions).values({
      actorId: actor.userId,
      actorLabel: `ARCH-${actor.memberId}`,
      targetUserId: report.targetOwnerId,
      targetType: report.targetType,
      targetId: report.targetId,
      action: outcome === 'dismissed' ? 'dismiss_report' : 'note',
      reason: note,
      reportId,
    });
    return { slug, communityId };
  });
  if (!resolved) return fail('That report is not open, or you do not moderate its community.');
  await auditFromSession({
    action: 'community.report.resolved',
    targetType: 'report',
    targetId: reportId,
    targetLabel: resolved.slug,
    metadata: { outcome },
  });
  revalidatePath(`/communities/${resolved.slug}`);
  revalidatePath('/admin');
  return ok();
}

export async function createCommunity(input: {
  name: string;
  description: string;
  isPrivate: boolean;
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
        name, description, slug, ownerId: actor.userId, isPrivate: input.isPrivate === true,
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

export async function updateCommunityRules(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) redirect('/communities');
  const communityId = String(formData.get('communityId') ?? '');
  const rules = cleanText(String(formData.get('rules') ?? ''), 5000);
  if (!isUuid(communityId)) redirect('/communities');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/communities?error=slow-down');

  const slug = await db.transaction(async (tx) => {
    const [community] = await tx.select({ id: communities.id, slug: communities.slug })
      .from(communities).where(eq(communities.id, communityId))
      .for('update').limit(1);
    if (!community) return null;
    const [membership] = await tx.select({ role: communityMembers.role })
      .from(communityMembers).where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, actor.userId),
      )).limit(1);
    if (membership?.role !== 'owner') return null;
    await tx.update(communities).set({ rules, updatedAt: new Date() })
      .where(eq(communities.id, communityId));
    return community.slug;
  });
  if (!slug) redirect('/communities');
  await auditFromSession({ action: 'community.rules.updated', targetType: 'community', targetId: communityId, targetLabel: slug });
  revalidatePath('/communities');
  revalidatePath(`/communities/${slug}`);
  redirect(`/communities/${slug}?rules=updated`);
}

export interface CommunityInviteView {
  id: string;
  expiresAt: Date;
  maxUses: number;
  useCount: number;
  revokedAt: Date | null;
}

export async function createCommunityInvite(input: {
  communityId: string;
  expiresInHours: number;
  maxUses: number;
  csrf: string;
}): Promise<ActionResult<{ inviteId: string; token: string; expiresAt: string }>> {
  await verifyCsrfValue(input?.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community invitations are not available for this identity.');
  if (!isUuid(input.communityId) || !Number.isInteger(input.expiresInHours) ||
      input.expiresInHours < 1 || input.expiresInHours > 168 ||
      !Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 100) {
    return fail('Choose a valid invite expiry and use limit.');
  }
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before creating another invite.');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  const invite = await db.transaction(async (tx) => {
    const [community] = await tx.select({ id: communities.id, slug: communities.slug })
      .from(communities).where(and(eq(communities.id, input.communityId), eq(communities.isPrivate, true)))
      .for('update').limit(1);
    if (!community) return null;
    const [owner] = await tx.select({ userId: communityMembers.userId })
      .from(communityMembers).where(and(
        eq(communityMembers.communityId, input.communityId),
        eq(communityMembers.userId, actor.userId),
        eq(communityMembers.role, 'owner'),
      )).for('update').limit(1);
    if (!owner) return null;
    const [created] = await tx.insert(communityInvites).values({
      communityId: input.communityId,
      createdById: actor.userId,
      tokenHash,
      expiresAt,
      maxUses: input.maxUses,
    }).returning({ id: communityInvites.id });
    return created ?? null;
  });
  if (!invite) return fail('Only the owner of a private community can create invite links.');
  await auditFromSession({ action: 'community.invite.created', targetType: 'community', targetId: input.communityId, targetLabel: 'Private community invite', metadata: { inviteId: invite.id, expiresAt: expiresAt.toISOString(), maxUses: input.maxUses } });
  revalidatePath('/communities');
  return ok({ inviteId: invite.id, token, expiresAt: expiresAt.toISOString() });
}

export async function revokeCommunityInvite(input: { inviteId: string; csrf: string }): Promise<ActionResult> {
  await verifyCsrfValue(input?.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community invitations are not available for this identity.');
  if (!isUuid(input.inviteId)) return fail('That invite is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing invite links.');

  const revoked = await db.transaction(async (tx) => {
    const [invite] = await tx.select({ id: communityInvites.id, communityId: communityInvites.communityId })
      .from(communityInvites).where(and(
        eq(communityInvites.id, input.inviteId),
        isNull(communityInvites.revokedAt),
      )).for('update').limit(1);
    if (!invite) return null;
    const [owner] = await tx.select({ userId: communityMembers.userId })
      .from(communityMembers).where(and(
        eq(communityMembers.communityId, invite.communityId),
        eq(communityMembers.userId, actor.userId),
        eq(communityMembers.role, 'owner'),
      )).for('update').limit(1);
    if (!owner) return null;
    await tx.update(communityInvites).set({ revokedAt: new Date() })
      .where(eq(communityInvites.id, invite.id));
    return invite.communityId;
  });
  if (!revoked) return fail('Only the current community owner can revoke that invite.');
  await auditFromSession({ action: 'community.invite.revoked', targetType: 'community_invite', targetId: input.inviteId, targetLabel: 'Private community invite' });
  revalidatePath('/communities');
  return ok();
}

export async function acceptCommunityInvite(token: string, csrf: string): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community access is not available for this identity.');
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return fail('That invite link is not valid.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before trying that invite again.');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const accepted = await db.transaction(async (tx) => {
    const [invite] = await tx.select({
      id: communityInvites.id,
      communityId: communityInvites.communityId,
      expiresAt: communityInvites.expiresAt,
      maxUses: communityInvites.maxUses,
      useCount: communityInvites.useCount,
    }).from(communityInvites).where(and(
      eq(communityInvites.tokenHash, tokenHash),
      isNull(communityInvites.revokedAt),
    )).for('update').limit(1);
    if (!invite || invite.expiresAt <= new Date() || invite.useCount >= invite.maxUses) return null;
    const [community] = await tx.select({ id: communities.id, slug: communities.slug, ownerId: communities.ownerId })
      .from(communities).where(and(
        eq(communities.id, invite.communityId),
        eq(communities.isPrivate, true),
      )).for('update').limit(1);
    if (!community) return null;
    const [existing] = await tx.select({ userId: communityMembers.userId })
      .from(communityMembers).where(and(
        eq(communityMembers.communityId, community.id),
        eq(communityMembers.userId, actor.userId),
      )).limit(1);
    if (existing) return { slug: community.slug, communityId: community.id, alreadyMember: true };
    const activeMembers = await tx.select({ userId: communityMembers.userId })
      .from(communityMembers)
      .innerJoin(users, and(
        eq(users.id, communityMembers.userId),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ))
      .where(eq(communityMembers.communityId, community.id));
    const memberIds = activeMembers.map((member) => member.userId);
    if (!memberIds.includes(community.ownerId)) return null;
    const blocked = await tx.select({ id: blocks.id }).from(blocks).where(or(
      and(eq(blocks.blockerId, actor.userId), inArray(blocks.blockedId, memberIds)),
      and(inArray(blocks.blockerId, memberIds), eq(blocks.blockedId, actor.userId)),
    )).limit(1);
    if (blocked.length) return null;
    await tx.insert(communityMembers).values({
      communityId: community.id,
      userId: actor.userId,
      role: 'member',
    });
    await tx.update(communityInvites).set({
      useCount: sql`${communityInvites.useCount} + 1`,
    }).where(eq(communityInvites.id, invite.id));
    return { slug: community.slug, communityId: community.id, alreadyMember: false };
  });
  if (!accepted) return fail('That invite is expired, revoked, used up, or unavailable.');
  if (!accepted.alreadyMember) await auditFromSession({ action: 'community.invite.accepted', targetType: 'community', targetId: accepted.communityId, targetLabel: accepted.slug });
  revalidatePath('/communities');
  revalidatePath(`/communities/${accepted.slug}`);
  return ok({ slug: accepted.slug });
}

export async function joinCommunity(communityId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Community membership is not available for this identity.');
  if (!isUuid(communityId)) return fail('That community is not available.');
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
  if (!isUuid(communityId)) return fail('That community is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing community membership.');
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
  if (!isUuid(input.communityId)) return fail('That community is not available.');
  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) return fail('You are posting too quickly. Wait a moment.');
  const title = cleanText(input.title, 160);
  const body = cleanText(input.body, 5000);
  if (!body) return fail('Write something before publishing.');
  const created = await db.transaction(async (tx) => {
    const [membership] = await tx.select({ communityId: communityMembers.communityId })
      .from(communityMembers).innerJoin(communities, eq(communities.id, communityMembers.communityId))
      .where(and(
        eq(communityMembers.communityId, input.communityId),
        eq(communityMembers.userId, actor.userId),
        eq(communities.isPrivate, false),
      ))
      .for('update')
      .limit(1);
    if (!membership) return false;
    await tx.insert(communityPosts).values({
      communityId: input.communityId,
      authorId: actor.userId,
      title: title || null,
      body,
    });
    return true;
  });
  if (!created) return fail('Join this community before posting.');
  revalidatePath('/communities');
  return ok();
}


export async function createCommunityComment(input: {
  postId: string;
  body: string;
  parentId?: string | null;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Commenting is not available for this identity.');
  if (!isUuid(input.postId) || (input.parentId && !isUuid(input.parentId))) return fail('That discussion is not available.');
  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) return fail('You are commenting too quickly. Wait a moment.');

  const body = cleanText(input.body, 2500);
  if (!body) return fail('Write a comment before publishing.');

  const target = await db.transaction(async (tx) => {
    const [row] = await tx.select({
      postId: communityPosts.id,
      communityId: communityPosts.communityId,
      slug: communities.slug,
    })
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
      .for('update')
      .limit(1);
    if (!row) return null;
    let parentId: string | null = null;
    if (input.parentId) {
      const [parent] = await tx.select({ id: communityPostComments.id })
        .from(communityPostComments)
        .innerJoin(users, eq(users.id, communityPostComments.authorId))
        .where(and(
          eq(communityPostComments.id, input.parentId),
          eq(communityPostComments.postId, row.postId),
          eq(communityPostComments.status, 'published'),
          isNull(communityPostComments.removedAt),
          isNull(communityPostComments.parentId),
          eq(users.status, 'active'),
          isNull(users.removedAt),
        ))
        .for('update')
        .limit(1);
      if (!parent) return null;
      parentId = parent.id;
    }
    await tx.insert(communityPostComments).values({
      postId: row.postId,
      authorId: actor.userId,
      parentId,
      body,
    });
    return row;
  });
  if (!target) return fail('Join the community and choose an available discussion before commenting.');

  revalidatePath('/communities');
  revalidatePath(`/communities/${target.slug}`);
  return ok();
}

export async function removeCommunityComment(commentId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!isUuid(commentId)) return fail('That comment is not available.');
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

  const removed = await db.transaction(async (tx) => {
    const [membership] = await tx.select({ role: communityMembers.role })
      .from(communityMembers)
      .where(and(
        eq(communityMembers.communityId, comment.communityId),
        eq(communityMembers.userId, actor.userId),
      ))
      .for('update')
      .limit(1);
    const canModerate = membership?.role === 'owner' || membership?.role === 'moderator';
    if (comment.authorId !== actor.userId && !canModerate) return false;

    const [row] = await tx.update(communityPostComments).set({
      status: 'removed',
      removedAt: new Date(),
    }).where(and(
      eq(communityPostComments.id, comment.id),
      eq(communityPostComments.status, 'published'),
      isNull(communityPostComments.removedAt),
    )).returning({ id: communityPostComments.id });
    return Boolean(row);
  });
  if (!removed) return fail('Only the author or a current community moderator can remove this comment.');
  await auditFromSession({ action: 'community.comment.removed', targetType: 'community_comment', targetId: comment.id, targetLabel: comment.slug });
  revalidatePath('/communities');
  revalidatePath(`/communities/${comment.slug}`);
  return ok();
}


export async function voteCommunityPost(input: {
  postId: string;
  value: 1 | -1;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Voting is not available for this identity.');
  if (!isUuid(input.postId)) return fail('That discussion is not available.');
  if (input.value !== 1 && input.value !== -1) return fail('Choose a valid vote.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before voting again.');

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
  if (!target) return fail('Join the community before voting on its discussions.');

  const voted = await db.transaction(async (tx) => {
    // Serialize votes on the post so a rapid double-click cannot leave a stale vote.
    const [livePost] = await tx.select({ id: communityPosts.id })
      .from(communityPosts)
      .where(and(
        eq(communityPosts.id, target.postId),
        eq(communityPosts.status, 'published'),
        isNull(communityPosts.removedAt),
      ))
      .for('update')
      .limit(1);
    if (!livePost) return false;
    const [activeMembership] = await tx.select({ userId: communityMembers.userId })
      .from(communityMembers)
      .where(and(
        eq(communityMembers.communityId, target.communityId),
        eq(communityMembers.userId, actor.userId),
      ))
      .for('update')
      .limit(1);
    if (!activeMembership) return false;
    const [existing] = await tx.select({ value: communityPostVotes.value })
      .from(communityPostVotes)
      .where(and(
        eq(communityPostVotes.postId, target.postId),
        eq(communityPostVotes.userId, actor.userId),
      ))
      .limit(1);
    if (existing?.value === input.value) {
      await tx.delete(communityPostVotes).where(and(
        eq(communityPostVotes.postId, target.postId),
        eq(communityPostVotes.userId, actor.userId),
      ));
      return true;
    }
    await tx.insert(communityPostVotes).values({
      postId: target.postId,
      userId: actor.userId,
      value: input.value,
    }).onConflictDoUpdate({
      target: [communityPostVotes.postId, communityPostVotes.userId],
      set: { value: input.value },
    });
    return true;
  });
  if (!voted) return fail('Join the community before voting on its discussions.');
  revalidatePath('/communities');
  revalidatePath(`/communities/${target.slug}`);
  return ok();
}


/** Owner-only promotion/demotion of a current community member. */
export async function setCommunityModerator(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) redirect('/communities?error=unavailable');

  const communityId = String(formData.get('communityId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!isUuid(communityId) || !isUuid(targetUserId) || targetUserId === actor.userId ||
      !['member', 'moderator'].includes(role) || formData.get('confirmRoleChange') !== 'on') {
    redirect('/communities?error=invalid-role');
  }
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/communities?error=slow-down');

  const result = await db.transaction(async (tx) => {
    const [community] = await tx.select({ id: communities.id, slug: communities.slug, ownerId: communities.ownerId })
      .from(communities).where(eq(communities.id, communityId)).for('update').limit(1);
    if (!community || community.ownerId !== actor.userId) return null;
    const [target] = await tx.select({ userId: communityMembers.userId, role: communityMembers.role })
      .from(communityMembers)
      .innerJoin(users, eq(users.id, communityMembers.userId))
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, targetUserId),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ))
      .for('update')
      .limit(1);
    if (!target || target.role === 'owner') return null;
    await tx.update(communityMembers)
      .set({ role })
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, targetUserId),
      ));
    return { slug: community.slug };
  });
  if (!result) redirect('/communities?error=role-not-allowed');
  await auditFromSession({ action: 'community.moderator.role_changed', targetType: 'community', targetId: communityId, targetLabel: result.slug, metadata: { targetUserId, role } });
  revalidatePath('/communities');
  revalidatePath(`/communities/${result.slug}`);
  redirect(`/communities/${result.slug}?role=updated`);
}

/**
 * Transfer ownership to an existing, active community member.
 * The current owner becomes a moderator so the community is never left without
 * a responsible owner and the transfer does not silently remove moderation.
 */
export async function transferCommunityOwnership(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) redirect('/communities?error=unavailable');

  const communityId = String(formData.get('communityId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  if (!isUuid(communityId) || !isUuid(targetUserId) || targetUserId === actor.userId ||
      formData.get('confirmTransfer') !== 'on') {
    redirect('/communities?error=invalid-transfer');
  }

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/communities?error=slow-down');

  const result = await db.transaction(async (tx) => {
    const [community] = await tx.select({
      id: communities.id,
      slug: communities.slug,
      ownerId: communities.ownerId,
    }).from(communities).where(eq(communities.id, communityId)).for('update').limit(1);
    if (!community || community.ownerId !== actor.userId) return null;

    const [target] = await tx.select({
      userId: communityMembers.userId,
    }).from(communityMembers)
      .innerJoin(users, eq(users.id, communityMembers.userId))
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, targetUserId),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ))
      .for('update')
      .limit(1);
    if (!target) return null;

    await tx.update(communityMembers).set({ role: 'moderator' }).where(and(
      eq(communityMembers.communityId, communityId),
      eq(communityMembers.userId, actor.userId),
    ));
    await tx.update(communityMembers).set({ role: 'owner' }).where(and(
      eq(communityMembers.communityId, communityId),
      eq(communityMembers.userId, targetUserId),
    ));
    await tx.update(communities).set({ ownerId: targetUserId }).where(eq(communities.id, communityId));
    return { slug: community.slug };
  });

  if (!result) redirect('/communities?error=transfer-not-allowed');
  await auditFromSession({ action: 'community.owner.transferred', targetType: 'community', targetId: communityId, targetLabel: result.slug, metadata: { newOwnerId: targetUserId } });
  revalidatePath('/communities');
  revalidatePath(`/communities/${result.slug}`);
  redirect(`/communities/${result.slug}?transferred=1`);
}
