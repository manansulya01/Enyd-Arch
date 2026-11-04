'use server';

/** Reports — every member can flag anything; nothing auto-acts invisibly. */
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '~db';
import { communityMembers, communityPostComments, communityPosts, communities, reports } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { REPORT_REASONS, URGENT_REPORT_REASONS } from '~/lib/domain';

const REASONS = new Set<string>(REPORT_REASONS.map((reason) => reason.value));
const TARGETS = new Set(['user', 'post', 'comment', 'message', 'archive_object', 'game', 'gallery_post', 'event', 'project', 'community_post', 'community_comment']);

export async function createReport(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('report', actor.userId);
  if (!limiter.allowed) return fail('You have filed several reports recently. If something is urgent, contact Administration directly.');

  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 4000);

  if (!TARGETS.has(targetType)) return fail('Unknown report target.');
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return fail('Missing target.');
  if (!REASONS.has(reason)) return fail('Choose a reason.', { reason: ['Required.'] });

  let targetOwnerId: string | null = null;
  if (targetType === 'community_post') {
    const [target] = await db.select({
      ownerId: communityPosts.authorId,
      communityId: communities.id,
      isPrivate: communities.isPrivate,
    }).from(communityPosts)
      .innerJoin(communities, eq(communities.id, communityPosts.communityId))
      .where(and(
        eq(communityPosts.id, targetId),
        eq(communityPosts.status, 'published'),
        isNull(communityPosts.removedAt),
      )).limit(1);
    if (!target) return fail('That content is no longer available.');
    if (target.isPrivate) {
      const [membership] = await db.select({ userId: communityMembers.userId })
        .from(communityMembers).where(and(
          eq(communityMembers.communityId, target.communityId),
          eq(communityMembers.userId, actor.userId),
        )).limit(1);
      if (!membership) return fail('That content is no longer available.');
    }
    targetOwnerId = target.ownerId;
  } else if (targetType === 'community_comment') {
    const [target] = await db.select({
      ownerId: communityPostComments.authorId,
      communityId: communities.id,
      isPrivate: communities.isPrivate,
    }).from(communityPostComments)
      .innerJoin(communityPosts, eq(communityPosts.id, communityPostComments.postId))
      .innerJoin(communities, eq(communities.id, communityPosts.communityId))
      .where(and(
        eq(communityPostComments.id, targetId),
        eq(communityPostComments.status, 'published'),
        isNull(communityPostComments.removedAt),
        eq(communityPosts.status, 'published'),
        isNull(communityPosts.removedAt),
      )).limit(1);
    if (!target) return fail('That content is no longer available.');
    if (target.isPrivate) {
      const [membership] = await db.select({ userId: communityMembers.userId })
        .from(communityMembers).where(and(
          eq(communityMembers.communityId, target.communityId),
          eq(communityMembers.userId, actor.userId),
        )).limit(1);
      if (!membership) return fail('That content is no longer available.');
    }
    targetOwnerId = target.ownerId;
  }

  const priority = URGENT_REPORT_REASONS.has(reason) ? 'urgent' : 'normal';

  await db.insert(reports).values({
    reporterId: actor.userId,
    targetOwnerId,
    targetType: targetType as never,
    targetId,
    reason: reason as never,
    detail,
    priority,
  });

  return ok();
}
