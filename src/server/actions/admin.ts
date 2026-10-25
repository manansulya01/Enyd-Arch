'use server';

/**
 * Administration
 *
 * Every mutation here re-checks the permission server-side and writes an audit
 * row. Reports disclose nothing about their reporter to the reported member.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  deviceTransferRequests,
  devices,
  games,
  invitations,
  moderationActions,
  reports,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult, type FormState } from '~/lib/action-result';
import { adminContextFor, adminCan, writeAudit } from '~/server/security/audit';
import { currentActor, revokeAllSessionsForUser } from '~/server/auth/session';
import { invitationCode } from '~/server/crypto';
import { verifyCsrf } from '~/server/csrf';

async function requirePermission(permission: string) {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  const admin = await adminContextFor(actor.userId);
  if (!admin || !adminCan(admin, permission)) {
    throw new Error('FORBIDDEN');
  }
  return { actor, admin };
}

export interface InvitationSummary {
  id: string;
  code: string;
  tier: string;
  uses: number;
  maxUses: number;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Only administrators with the explicit invitation-management permission can view codes. */
export async function listInvitations(): Promise<InvitationSummary[]> {
  await requirePermission('invitations.manage');
  return db
    .select({
      id: invitations.id,
      code: invitations.code,
      tier: invitations.tier,
      uses: invitations.uses,
      maxUses: invitations.maxUses,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
    .limit(100);
}

export async function createInvitationAction(
  _previous: FormState<{ code: string }> | null,
  formData: FormData,
): Promise<FormState<{ code: string }>> {
  await verifyCsrf(formData);
  const { actor } = await requirePermission('invitations.manage');
  const tier = String(formData.get('tier') ?? 'member');
  const maxUses = Number(formData.get('maxUses') ?? 1);
  const expiresInDays = Number(formData.get('expiresInDays') ?? 30);

  if (tier !== 'member' && tier !== 'inner_arch') {
    return fail('Choose a valid invitation tier.');
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    return fail('Invitation uses must be between 1 and 100.');
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    return fail('Expiry must be between 1 and 365 days.');
  }

  const code = `ARCH-${invitationCode(10)}`;
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  const [created] = await db
    .insert(invitations)
    .values({
      code,
      tier,
      createdBy: actor.userId,
      maxUses,
      expiresAt,
      note: tier === 'inner_arch' ? 'Inner Arch invitation' : 'Member invitation',
    })
    .returning({ id: invitations.id });

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: 'invitation.created',
    targetType: 'invitation',
    targetId: created!.id,
    reason: `Tier ${tier}; uses ${maxUses}; expires ${expiresAt.toISOString()}`,
  });
  revalidatePath('/admin');
  return ok({ code });
}

export async function revokeInvitationAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState> {
  await verifyCsrf(formData);
  const { actor } = await requirePermission('invitations.manage');
  const id = String(formData.get('invitationId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('That invitation could not be found.');

  const [revoked] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });
  if (!revoked) return fail('That invitation is already revoked or no longer exists.');

  await writeAudit({ id: actor.userId, label: `ARCH-${actor.memberId}` }, {
    action: 'invitation.revoked',
    targetType: 'invitation',
    targetId: id,
  });
  revalidatePath('/admin');
  return ok();
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
