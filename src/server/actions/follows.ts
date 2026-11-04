'use server';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { blocks, userFollows, userSettings, users } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrfValue } from '~/server/csrf';

async function eligibleTarget(viewerId: string, targetUserId: string): Promise<boolean> {
  if (!targetUserId || targetUserId === viewerId) return false;
  const [target] = await db.select({ id: users.id, discoverable: userSettings.discoverable })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.id, targetUserId), eq(users.status, 'active'), isNull(users.removedAt)))
    .limit(1);
  if (!target || target.discoverable === false) return false;
  const [blocked] = await db.select({ id: blocks.id }).from(blocks).where(or(
    and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetUserId)),
    and(eq(blocks.blockerId, targetUserId), eq(blocks.blockedId, viewerId)),
  )).limit(1);
  return !blocked;
}

export async function followMember(targetUserId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Following is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing who you follow.');
  if (!(await eligibleTarget(actor.userId, targetUserId))) return fail('That member is not available to follow.');
  await db.insert(userFollows).values({ followerId: actor.userId, followedId: targetUserId }).onConflictDoNothing();
  revalidatePath('/network');
  return ok();
}

export async function unfollowMember(targetUserId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Following is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing who you follow.');
  await db.delete(userFollows).where(and(
    eq(userFollows.followerId, actor.userId),
    eq(userFollows.followedId, targetUserId),
  ));
  revalidatePath('/network');
  return ok();
}
