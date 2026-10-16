'use server';

/**
 * Connections
 *
 * The opt-in social layer. Discovery is gated by age-safety rules and the
 * member's own settings; requests become matches only when both sides agree.
 */
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  blocks,
  connectionPreferences,
  connectionRequests,
  matches,
  userSettings,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { checkPairEligibility, orderPair } from '~/server/safety/connections';
import { notify } from '~/server/notify';
import { verifyCsrfValue } from '~/server/csrf';

const MODES = ['friendship', 'collaboration', 'dating'] as const;
type Mode = (typeof MODES)[number];

async function eligibilityContext(userId: string) {
  const [row] = await db
    .select({
      ageBand: users.ageBand,
      isMinor: users.isMinor,
      connectionsEnabled: userSettings.connectionsEnabled,
      datingOptIn: connectionPreferences.datingOptIn,
      showInDating: connectionPreferences.showInDating,
      minAgeBand: connectionPreferences.minAgeBand,
      maxAgeBand: connectionPreferences.maxAgeBand,
      maxDatingAgeGapBands: connectionPreferences.maxDatingAgeGapBands,
      friendshipOptIn: connectionPreferences.friendshipOptIn,
      collaborationOptIn: connectionPreferences.collaborationOptIn,
    })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .leftJoin(connectionPreferences, eq(connectionPreferences.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    viewerId: userId,
    viewerAgeBand: row.ageBand,
    viewerIsMinor: row.isMinor,
    viewerConnectionsEnabled: row.connectionsEnabled ?? false,
    viewerPrefs: {
      datingOptIn: row.datingOptIn ?? false,
      showInDating: row.showInDating ?? false,
      minAgeBand: row.minAgeBand ?? '13',
      maxAgeBand: row.maxAgeBand ?? '18+',
      maxDatingAgeGapBands: row.maxDatingAgeGapBands ?? 2,
      friendshipOptIn: row.friendshipOptIn ?? false,
      collaborationOptIn: row.collaborationOptIn ?? false,
    },
  };
}

export async function sendConnectionRequest(input: {
  toUserId: string;
  mode: Mode;
  note?: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!MODES.includes(input.mode)) return fail('Unknown connection mode.');

  const limiter = await acquire('connectionRequest', actor.userId);
  if (!limiter.allowed) return fail('Too many requests. Wait a little while.');

  const ctx = await eligibilityContext(actor.userId);
  if (!ctx) return fail('Your Connections settings are incomplete.');

  const verdict = await checkPairEligibility(ctx, input.toUserId, input.mode);
  if (!verdict.allowed) return fail(verdict.reason ?? 'That member is not available.');

  const [existingMatch] = await db
    .select({ status: matches.status })
    .from(matches)
    .where(
      and(
        eq(matches.mode, input.mode),
        sql`(${matches.userAId} = ${actor.userId} and ${matches.userBId} = ${input.toUserId})
          or (${matches.userAId} = ${input.toUserId} and ${matches.userBId} = ${actor.userId})`,
      ),
    )
    .limit(1);
  if (existingMatch?.status === 'accepted') return fail('You are already connected.');

  // Replace any stale pending request from me to them.
  await db
    .update(connectionRequests)
    .set({ state: 'revoked' })
    .where(
      and(
        eq(connectionRequests.fromUserId, actor.userId),
        eq(connectionRequests.toUserId, input.toUserId),
        eq(connectionRequests.mode, input.mode),
        eq(connectionRequests.state, 'pending'),
      ),
    );

  const [request] = await db
    .insert(connectionRequests)
    .values({
      fromUserId: actor.userId,
      toUserId: input.toUserId,
      mode: input.mode,
      note: (input.note ?? '').slice(0, 500),
    })
    .returning({ id: connectionRequests.id });

  await notify({
    userId: input.toUserId,
    kind: 'connection_request',
    title: `${actor.displayName} wants to connect (${input.mode})`,
    body: (input.note ?? '').slice(0, 140),
    href: '/connections',
    actorId: actor.userId,
    targetType: 'connection_request',
    targetId: request!.id,
  });

  revalidatePath('/connections');
  return ok();
}

export async function respondToRequest(requestId: string, accept: boolean, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const [request] = await db
    .select()
    .from(connectionRequests)
    .where(
      and(
        eq(connectionRequests.id, requestId),
        eq(connectionRequests.toUserId, actor.userId),
        eq(connectionRequests.state, 'pending'),
      ),
    )
    .limit(1);
  if (!request) return fail('That request is not available.');

  await db
    .update(connectionRequests)
    .set({ state: accept ? 'accepted' : 'declined', respondedAt: new Date() })
    .where(eq(connectionRequests.id, requestId));

  if (accept) {
    const [a, b] = orderPair(request.fromUserId, request.toUserId);
    const [me] = await db.select({ ageBand: users.ageBand }).from(users).where(eq(users.id, actor.userId)).limit(1);
    await db
      .insert(matches)
      .values({
        userAId: a!,
        userBId: b!,
        mode: request.mode,
        requestId: request.id,
        status: 'accepted',
        ageBandAtMatch: me?.ageBand ?? null,
      })
      .onConflictDoNothing();

    await notify({
      userId: request.fromUserId,
      kind: 'connection_match',
      title: `${actor.displayName} accepted your ${request.mode} request`,
      href: '/connections',
      actorId: actor.userId,
    });
  }

  revalidatePath('/connections');
  return ok();
}

export async function unmatch(matchId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const [match] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.id, matchId),
        sql`(${matches.userAId} = ${actor.userId} or ${matches.userBId} = ${actor.userId})`,
      ),
    )
    .limit(1);
  if (!match) return fail('That connection is not available.');

  await db.update(matches).set({ status: 'unmatched', updatedAt: new Date() }).where(eq(matches.id, matchId));
  revalidatePath('/connections');
  return ok();
}

export async function blockUser(userId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (userId === actor.userId) return fail('You cannot block yourself.');

  await db
    .insert(blocks)
    .values({ blockerId: actor.userId, blockedId: userId })
    .onConflictDoNothing();

  // Any match or pending request between the pair is dead.
  await db
    .update(matches)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(
      sql`(${matches.userAId} = ${actor.userId} and ${matches.userBId} = ${userId})
        or (${matches.userAId} = ${userId} and ${matches.userBId} = ${actor.userId})`,
    );

  revalidatePath('/connections');
  return ok();
}

export async function unblockUser(userId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  await db.delete(blocks).where(and(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, userId)));
  return ok();
}

