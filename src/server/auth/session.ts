import 'server-only';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '~db';
import { devices, sessions as sessionsTable, userRestrictions, users } from '~db/schema';
import { formatMemberId } from '~/lib/domain';
import { deriveCapabilities } from './capabilities';
export { deriveCapabilities } from './capabilities';
import { browserLabel, platformLabel, randomToken, sha256 } from '../crypto';

export const SESSION_COOKIE = 'enyd_session';
export const TRAIT_COOKIE = 'enyd_device_binding';

/** Rolling window. Created for 30 days and refreshed as it is used. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionActor {
  userId: string;
  username: string;
  displayName: string;
  memberId: number;
  /** Pre-formatted ARCH-XXXXXX, so views never re-derive it */
  memberIdLabel: string;
  level: string;
  status: string;
  sessionId: string;
  deviceId: string | null;
  capabilities: string[];
  ageBand: string;
  isMinor: boolean;
  onboarded: boolean;
}

const secureCookies = process.env.NODE_ENV === 'production';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookies,
    path: '/',
    maxAge,
  };
}

export function can(actor: SessionActor | null, capability: string): boolean {
  if (!actor) return false;
  return actor.capabilities.includes(capability);
}

export function canAll(actor: SessionActor | null, ...capabilities: string[]): boolean {
  return capabilities.every((capability) => can(actor, capability));
}

// ---------------------------------------------------------------------------
// Active restrictions
// ---------------------------------------------------------------------------

async function loadRestrictions(userId: string): Promise<string[]> {
  const now = new Date();
  const rows = await db
    .select({ capability: userRestrictions.capability })
    .from(userRestrictions)
    .where(
      and(
        eq(userRestrictions.userId, userId),
        isNull(userRestrictions.liftedAt),
        or(isNull(userRestrictions.endsAt), gt(userRestrictions.endsAt, now)),
      ),
    );
  return rows.map((row) => row.capability);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export interface CreateSessionInput {
  userId: string;
  deviceId: string | null;
  fingerprint: string;
  ipHash: string;
  userAgent: string;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const token = randomToken(32);
  const csrfSecret = randomToken(24);

  await db.insert(sessionsTable).values({
    tokenHash: sha256(token),
    userId: input.userId,
    deviceId: input.deviceId,
    csrfSecret,
    ipHash: input.ipHash,
    userAgent: input.userAgent.slice(0, 400),
    fingerprint: input.fingerprint,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));

  return csrfSecret;
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function revokeSession(reason: string): Promise<void> {
  const token = await readSessionToken();
  const store = await cookies();

  if (token) {
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(eq(sessionsTable.tokenHash, sha256(token)));
  }
  store.set(SESSION_COOKIE, '', cookieOptions(0));
}

export async function revokeAllSessionsForUser(
  userId: string,
  reason: string,
  exceptDeviceId?: string | null,
): Promise<number> {
  const scope =
    exceptDeviceId === undefined
      ? eq(sessionsTable.userId, userId)
      : and(
          eq(sessionsTable.userId, userId),
          sql`${sessionsTable.deviceId} is distinct from ${exceptDeviceId}`,
        );

  const revoked = await db
    .update(sessionsTable)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(scope, isNull(sessionsTable.revokedAt)))
    .returning({ id: sessionsTable.id });

  return revoked.length;
}

/**
 * Resolves the current member from the session cookie.
 *
 * Returns null for an invalid, expired, revoked, or displaced session. Device
 * state is verified on every read, so revoking a credential takes effect
 * immediately rather than at the next token expiry.
 */
export async function currentActor(): Promise<SessionActor | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessionsTable.id,
      deviceId: sessionsTable.deviceId,
      fingerprint: sessionsTable.fingerprint,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      level: users.level,
      status: users.status,
      ageBand: users.ageBand,
      isMinor: users.isMinor,
      onboardedAt: users.onboardedAt,
      deviceStatus: devices.status,
      deviceFingerprint: devices.fingerprint,
    })
    .from(sessionsTable)
    .innerJoin(users, eq(users.id, sessionsTable.userId))
    .leftJoin(devices, eq(devices.id, sessionsTable.deviceId))
    .where(
      and(
        eq(sessionsTable.tokenHash, sha256(token)),
        isNull(users.removedAt),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // The session must be presented from the browser profile it was issued to.
  if (row.deviceFingerprint && row.deviceFingerprint !== row.fingerprint) return null;
  if (row.deviceStatus && row.deviceStatus !== 'active') return null;
  if (row.status !== 'active') return null;

  const restricted = await loadRestrictions(row.userId);

  return {
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    memberId: row.memberId,
    memberIdLabel: formatMemberId(row.memberId),
    level: row.level,
    status: row.status,
    sessionId: row.sessionId,
    deviceId: row.deviceId,
    capabilities: deriveCapabilities({
      status: row.status,
      level: row.level,
      isMinor: row.isMinor,
      onboarded: Boolean(row.onboardedAt),
      restricted,
    }),
    ageBand: row.ageBand,
    isMinor: row.isMinor,
    onboarded: Boolean(row.onboardedAt),
  };
}

/** Slide the session expiry forward. Cheap enough to run once per request. */
export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    })
    .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)));
}

export async function sessionCsrfSecret(): Promise<string | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const rows = await db
    .select({ csrfSecret: sessionsTable.csrfSecret })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.tokenHash, sha256(token)),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0]?.csrfSecret ?? null;
}

export async function listSessions(userId: string) {
  return db
    .select({
      id: sessionsTable.id,
      createdAt: sessionsTable.createdAt,
      lastSeenAt: sessionsTable.lastSeenAt,
      expiresAt: sessionsTable.expiresAt,
      ipHash: sessionsTable.ipHash,
      userAgent: sessionsTable.userAgent,
      deviceId: sessionsTable.deviceId,
      deviceLabel: devices.label,
      devicePlatform: devices.platform,
    })
    .from(sessionsTable)
    .leftJoin(devices, eq(devices.id, sessionsTable.deviceId))
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)))
    .orderBy(desc(sessionsTable.lastSeenAt));
}

export async function revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
  const revoked = await db
    .update(sessionsTable)
    .set({ revokedAt: new Date(), revokedReason: 'revoked_by_member' })
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        eq(sessionsTable.userId, userId),
        isNull(sessionsTable.revokedAt),
      ),
    )
    .returning({ id: sessionsTable.id });
  return revoked.length > 0;
}

export function describeDevice(userAgent: string | null, platform: string | null) {
  const agent = userAgent ?? '';
  const os = platform ?? (agent ? platformLabel(agent) : 'Unknown device');
  return {
    label: agent ? `${browserLabel(agent)} on ${os}` : os,
    browser: agent ? browserLabel(agent) : 'Unknown',
    os,
  };
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

export async function requireActor(): Promise<SessionActor> {
  const actor = await currentActor();
  if (!actor) throw new Error('UNAUTHENTICATED');
  return actor;
}

export async function requireCapability(capability: string): Promise<SessionActor> {
  const actor = await requireActor();
  if (!can(actor, capability)) throw new Error('FORBIDDEN');
  return actor;
}