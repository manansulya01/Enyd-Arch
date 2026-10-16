'use server';

/**
 * Administration
 *
 * Every mutation here re-checks the permission server-side and writes an audit
 * row. Reports disclose nothing about their reporter to the reported member.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  deviceTransferRequests,
  devices,
  games,
  moderationActions,
  reports,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { adminContextFor, adminCan, writeAudit } from '~/server/security/audit';
import { currentActor, revokeAllSessionsForUser } from '~/server/auth/session';

async function requirePermission(permission: string) {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  const admin = await adminContextFor(actor.userId);
  if (!admin || !adminCan(admin, permission)) {
    throw new Error('FORBIDDEN');
  }
  return { actor, admin };
}

export async function resolveReport(
  reportId: string,
  outcome: 'resolved' | 'dismissed',
  resolution: string,
): Promise<ActionResult> {
  const { actor } = await requirePermission('reports.resolve');

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!report) return fail('Report not found.');

  await db
    .update(reports)
    .set({ state: outcome, resolution: resolution.slice(0, 2000), resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(eq(reports.id, reportId));

  await db.insert(moderationActions).values({
    actorId: actor.userId,
    actorLabel: `ARCH-${actor.memberId}`,
    targetUserId: report.targetOwnerId,
    targetType: report.targetType,
    targetId: report.targetId,
    action: outcome === 'dismissed' ? 'dismiss_report' : 'note',
    reason: resolution.slice(0, 2000),
    reportId,
  });

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: 'report.resolved',
    targetType: 'report',
    targetId: reportId,
    reason: `${outcome}: ${resolution}`.slice(0, 400),
  });

  revalidatePath('/admin');
  return ok();
}

export async function suspendUser(userId: string, reason: string): Promise<ActionResult> {
  const { actor } = await requirePermission('users.suspend');

  await db
    .update(users)
    .set({ status: 'suspended', suspendedAt: new Date(), suspensionReason: reason.slice(0, 500) })
    .where(eq(users.id, userId));
  await revokeAllSessionsForUser(userId, 'suspended');

  await db.insert(moderationActions).values({
    actorId: actor.userId,
    actorLabel: `ARCH-${actor.memberId}`,
    targetUserId: userId,
    action: 'suspend_account',
    reason: reason.slice(0, 500),
  });
  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: 'user.suspended',
    targetType: 'user',
    targetId: userId,
    reason: reason.slice(0, 400),
  });

  revalidatePath('/admin');
  return ok();
}

export async function reinstateUser(userId: string): Promise<ActionResult> {
  const { actor } = await requirePermission('users.reinstate');

  await db
    .update(users)
    .set({ status: 'active', suspendedAt: null, suspensionReason: null })
    .where(eq(users.id, userId));

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: 'user.reinstated',
    targetType: 'user',
    targetId: userId,
  });

  revalidatePath('/admin');
  return ok();
}

export async function reviewGame(
  gameId: string,
  decision: 'approved' | 'rejected' | 'changes_requested',
  note: string,
): Promise<ActionResult> {
  const { actor } = await requirePermission('games.review');

  await db
    .update(games)
    .set({ status: decision, reviewNote: note.slice(0, 1000), reviewedBy: actor.userId, reviewedAt: new Date() })
    .where(eq(games.id, gameId));

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: `game.${decision}`,
    targetType: 'game',
    targetId: gameId,
    reason: note.slice(0, 400),
  });

  revalidatePath('/admin');
  revalidatePath('/arcade');
  return ok();
}

export async function reviewDeviceTransfer(
  requestId: string,
  approve: boolean,
  note: string,
): Promise<ActionResult> {
  const { actor } = await requirePermission('devices.approve_transfer');

  const [request] = await db
    .select()
    .from(deviceTransferRequests)
    .where(and(eq(deviceTransferRequests.id, requestId), eq(deviceTransferRequests.state, 'pending')))
    .limit(1);
  if (!request) return fail('That request is not available.');

  await db
    .update(deviceTransferRequests)
    .set({ state: approve ? 'approved' : 'denied', reviewedBy: actor.userId, reviewedAt: new Date(), reviewNote: note.slice(0, 1000) })
    .where(eq(deviceTransferRequests.id, requestId));

  if (approve) {
    // The account moves to re-enrollment; the old device can no longer sign in.
    await revokeAllSessionsForUser(request.userId, 'device_transfer');
    await db.update(users).set({ status: 're_enrollment' }).where(eq(users.id, request.userId));
    if (request.fromDeviceId) {
      await db
        .update(devices)
        .set({ status: 'revoked', revokedAt: new Date(), revokedReason: 'Approved device transfer' })
        .where(eq(devices.id, request.fromDeviceId));
    }
  }

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: approve ? 'device.transfer_approved' : 'device.transfer_denied',
    targetType: 'user',
    targetId: request.userId,
    reason: note.slice(0, 400),
  });

  revalidatePath('/admin');
  return ok();
}

/** Open reports, for the moderation queue. */
export async function openReportsForReview() {
  const { admin } = await requirePermission('reports.read');
  void admin;
  return db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      targetOwnerId: reports.targetOwnerId,
      reason: reports.reason,
      detail: reports.detail,
      state: reports.state,
      priority: reports.priority,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(sql`state in ('open','triaged','investigating')`)
    .orderBy(desc(reports.createdAt))
    .limit(100);
}
