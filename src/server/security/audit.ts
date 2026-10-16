import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '~db';
import {
  adminAssignments,
  adminRoles,
  auditLogs,
  devices,
  reports,
  users,
} from '~db/schema';
import { ADMIN_ROLES, formatMemberId, levelLabel, roleHasPermission } from '~/lib/domain';
import { ipPseudonym } from '../crypto';
import { currentActor } from '../auth/session';

/**
 * Audit log
 *
 * Append-only. Every sensitive administrative action writes one row. The log is
 * readable only by administrators holding `audit.read`, and it never contains
 * raw secrets, plaintext personal data, or session tokens — addresses appear
 * only as keyed pseudonyms.
 */

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditActorRef {
  id: string;
  label: string;
  ip?: string;
}

export async function writeAudit(actor: AuditActorRef | null, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: actor?.id ?? null,
    actorLabel: actor?.label ?? 'system',
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    targetLabel: entry.targetLabel?.slice(0, 96) ?? null,
    reason: entry.reason ?? null,
    metadata: redact(entry.metadata ?? {}),
    ipHash: actor?.ip ? ipPseudonym(actor.ip) : null,
  });
}

export async function auditFromSession(entry: AuditEntry): Promise<void> {
  const actor = await currentActor();
  if (!actor) {
    await writeAudit(null, entry);
    return;
  }
  await writeAudit(
    { id: actor.userId, label: formatMemberId(actor.memberId), ip: 'session' },
    entry,
  );
}

/** Strips anything that looks like a credential before persisting metadata. */
function redact(metadata: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /password|secret|token|credential|cookie|authorization|privatekey/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (forbidden.test(key)) continue;
    out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
  }
  return out;
}

export async function readAuditLog(options: { limit?: number; action?: string }) {
  const limit = Math.min(options.limit ?? 100, 500);
  const query = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      targetLabel: auditLogs.targetLabel,
      reason: auditLogs.reason,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorLabel: auditLogs.actorLabel,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  if (options.action) {
    return db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        targetLabel: auditLogs.targetLabel,
        reason: auditLogs.reason,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorLabel: auditLogs.actorLabel,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.action, options.action))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  return query;
}

// ---------------------------------------------------------------------------
// Administration authorisation
// ---------------------------------------------------------------------------

export interface AdminContext {
  userId: string;
  label: string;
  roles: Array<{ role: string; label: string; rank: number; permissions: string[] }>;
  permissions: string[];
  highestRank: number;
}

export async function adminContextFor(userId: string): Promise<AdminContext | null> {
  const rows = await db
    .select({
      role: adminRoles.role,
      label: adminRoles.label,
      rank: adminRoles.rank,
      permissions: adminRoles.permissions,
    })
    .from(adminAssignments)
    .innerJoin(adminRoles, eq(adminRoles.id, adminAssignments.adminRoleId))
    .where(
      and(eq(adminAssignments.userId, userId), isNull(adminAssignments.revokedAt)),
    );

  if (rows.length === 0) return null;

  const permissions = new Set<string>();
  for (const row of rows) for (const permission of row.permissions) permissions.add(permission);

  const [identity] = await db
    .select({ memberId: users.memberId, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    userId,
    label: identity ? formatMemberId(identity.memberId) : 'unknown',
    roles: rows.map((row) => ({
      role: row.role,
      label: row.label,
      rank: row.rank,
      permissions: row.permissions,
    })),
    permissions: [...permissions],
    highestRank: Math.max(...rows.map((row) => row.rank)),
  };
}

export async function currentAdmin(): Promise<AdminContext | null> {
  const actor = await currentActor();
  if (!actor) return null;
  return adminContextFor(actor.userId);
}

export function adminCan(context: AdminContext | null, permission: string): boolean {
  if (!context) return false;
  return context.permissions.some((granted) => roleHasPermission(granted, [permission], permission));
}

/**
 * Throws when the caller lacks a permission. Used by every admin route so a
 * missing check is a hard failure rather than a silent pass.
 */
export function requireAdminPermission(context: AdminContext | null, permission: string): AdminContext {
  if (!context) throw new Error('UNAUTHENTICATED');
  if (!adminCan(context, permission)) throw new Error('FORBIDDEN');
  return context;
}

// ---------------------------------------------------------------------------
// Security posture summary (system health)
// ---------------------------------------------------------------------------

export async function securityPosture() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [suspended] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`status in ('suspended','banned')`);
  const [staleDevices] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(devices)
    .where(and(eq(devices.status, 'active'), sql`${devices.lastSeenAt} < ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)}`));
  const [openReports] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(sql`state in ('open','triaged','investigating')`);
  const [urgentReports] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(sql`state <> 'resolved' and reason in ('minor_safety','grooming','threat_or_violence','self_harm','illegal_content')`);
  const [recentAudit] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(sql`${auditLogs.createdAt} > ${dayAgo}`);

  return {
    suspendedAccounts: Number(suspended?.count ?? 0),
    dormantDevices: Number(staleDevices?.count ?? 0),
    openReports: Number(openReports?.count ?? 0),
    urgentReports: Number(urgentReports?.count ?? 0),
    auditEntriesLast24h: Number(recentAudit?.count ?? 0),
  };
}

export const ROLE_DEFINITIONS = ADMIN_ROLES;
export { levelLabel };