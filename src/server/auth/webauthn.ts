import 'server-only';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '~db';
import { deviceCredentials, devices, users, webauthnChallenges } from '~db/schema';
import { base64url, fromBase64url, sha256 } from '../crypto';

/**
 * Device credentials
 *
 * The server stores only WebAuthn public keys. Private keys never leave the
 * authenticator and, on most platforms, are hardware-backed (Touch ID, Windows
 * Hello, Android Keystore, a USB security key). Each credential is bound to one
 * member and one enrolled device, and can be revoked independently of the
 * account.
 *
 * Challenges live in Postgres rather than process memory so they survive a
 * deploy, are single-use, and cannot be replayed across instances.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rpName(): string {
  return process.env.APP_ORIGIN?.includes('localhost') ? 'Enyd Arch (Local)' : 'Enyd Arch';
}

export function rpID(): string {
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  try {
    return new URL(origin).hostname;
  } catch {
    return 'localhost';
  }
}

export function expectedOrigin(): string {
  return process.env.APP_ORIGIN ?? 'http://localhost:3000';
}

export type WebAuthnResult<T> = { ok: true } & T | { ok: false; reason: string };

async function storeChallenge(
  challenge: string,
  purpose: 'register' | 'authenticate',
  deviceFingerprint: string,
  userAgent: string,
): Promise<void> {
  // Opportunistic sweep keeps the table small without needing a scheduler.
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));

  await db.insert(webauthnChallenges).values({
    challenge,
    purpose,
    deviceFingerprint,
    userAgent: userAgent.slice(0, 400),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

/**
 * Single-use consumption. The WHERE clause is the lock: two concurrent requests
 * with the same challenge cannot both observe a row update.
 */
async function consumeChallenge(
  challenge: string,
  purpose: 'register' | 'authenticate',
  deviceFingerprint: string,
): Promise<boolean> {
  const rows = await db
    .update(webauthnChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(webauthnChallenges.challenge, challenge),
        eq(webauthnChallenges.purpose, purpose),
        eq(webauthnChallenges.deviceFingerprint, deviceFingerprint),
        gt(webauthnChallenges.expiresAt, new Date()),
        isNull(webauthnChallenges.consumedAt),
      ),
    )
    .returning({ id: webauthnChallenges.id });

  return rows.length === 1;
}

function readClientDataChallenge(clientDataJSON: string): string | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
    ) as { challenge?: unknown };
    return typeof decoded.challenge === 'string' ? decoded.challenge : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration — device enrolment
// ═══════════════════════════════════════════════════════════════════════════

export async function beginRegistration(input: {
  userId: string;
  username: string;
  displayName: string;
  deviceFingerprint: string;
  userAgent: string;
}) {
  const existing = await db
    .select({ credentialId: deviceCredentials.credentialId })
    .from(deviceCredentials)
    .where(
      and(
        eq(deviceCredentials.userId, input.userId),
        isNull(deviceCredentials.revokedAt),
      ),
    );

  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpID(),
    userName: input.username,
    userDisplayName: input.displayName,
    userID: new Uint8Array(Buffer.from(input.userId, 'utf8')),
    // No attestation is requested: we ask the platform to vouch for a human,
    // not to identify the device model to us.
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: row.credentialId })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  await storeChallenge(options.challenge, 'register', input.deviceFingerprint, input.userAgent);

  return {
    options: options as unknown as Record<string, unknown>,
    requestId: sha256(options.challenge).slice(0, 16),
  };
}

export async function finishRegistration(input: {
  userId: string;
  deviceFingerprint: string;
  deviceLabel: string;
  platform: string;
  response: RegistrationResponseJSON;
}): Promise<WebAuthnResult<{ deviceId: string }>> {
  const account = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!account[0] || !['pending_verification', 're_enrollment'].includes(account[0].status)) {
    return { ok: false, reason: 'This identity is not allowed to enrol another device.' };
  }

  const activeCredential = await db
    .select({ id: deviceCredentials.id })
    .from(deviceCredentials)
    .where(and(eq(deviceCredentials.userId, input.userId), isNull(deviceCredentials.revokedAt)))
    .limit(1);
  if (activeCredential[0]) {
    return { ok: false, reason: 'This identity already has an enrolled passkey. Use the device-transfer process to move it.' };
  }

  const challenge = readClientDataChallenge(input.response.response.clientDataJSON);
  if (!challenge) {
    return { ok: false, reason: 'The device response carried no challenge.' };
  }

  if (!(await consumeChallenge(challenge, 'register', input.deviceFingerprint))) {
    return { ok: false, reason: 'This device enrolment attempt was already used or has expired.' };
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
  } catch (error) {
    return { ok: false, reason: `Device credential could not be verified: ${(error as Error).message}` };
  }

  if (!verification.verified) {
    return { ok: false, reason: 'The device declined to create a credential.' };
  }

  const info = verification.registrationInfo;
  const credentialId = info.credential.id;

  const clash = await db
    .select({ id: deviceCredentials.id })
    .from(deviceCredentials)
    .where(eq(deviceCredentials.credentialId, credentialId))
    .limit(1);
  if (clash[0]) {
    return { ok: false, reason: 'That device credential is already enrolled.' };
  }

  // Reuse the row that already owns this fingerprint, otherwise create one.
  let deviceId: string;
  const existingDevice = await db
    .select({ id: devices.id, userId: devices.userId, status: devices.status })
    .from(devices)
    .where(eq(devices.fingerprint, input.deviceFingerprint))
    .limit(1);

  if (existingDevice[0] && existingDevice[0].userId === input.userId) {
    deviceId = existingDevice[0].id;
    await db
      .update(devices)
      .set({ status: 'active', lastSeenAt: new Date(), revokedAt: null, revokedReason: null })
      .where(eq(devices.id, deviceId));
  } else {
    const inserted = await db
      .insert(devices)
      .values({
        userId: input.userId,
        fingerprint: input.deviceFingerprint,
        label: input.deviceLabel,
        platform: input.platform,
        status: 'active',
      })
      .returning({ id: devices.id });
    deviceId = inserted[0]!.id;
  }

  await db.insert(deviceCredentials).values({
    userId: input.userId,
    deviceId,
    credentialId,
    publicKey: base64url(info.credential.publicKey),
    counter: info.credential.counter ?? 0,
    transports: info.credential.transports ?? [],
    backedUp: info.credentialBackedUp,
    status: 'active',
  });

  return { ok: true, deviceId };
}

// ═══════════════════════════════════════════════════════════════════════════
// Authentication — proving device possession
// ═══════════════════════════════════════════════════════════════════════════

export async function beginAuthentication(input: {
  deviceFingerprint: string;
  userAgent: string;
}) {
  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    userVerification: 'required',
  });

  await storeChallenge(
    options.challenge,
    'authenticate',
    input.deviceFingerprint,
    input.userAgent,
  );

  return { options: options as unknown as Record<string, unknown> };
}

export async function finishAuthentication(input: {
  userId: string;
  deviceFingerprint: string;
  response: AuthenticationResponseJSON;
}): Promise<WebAuthnResult<{ deviceId: string | null; backedUp: boolean }>> {
  const stored = (
    await db
      .select()
      .from(deviceCredentials)
      .where(
        and(
          eq(deviceCredentials.credentialId, input.response.id),
          eq(deviceCredentials.userId, input.userId),
          isNull(deviceCredentials.revokedAt),
        ),
      )
      .limit(1)
  )[0];

  if (!stored || stored.status !== 'active') {
    return { ok: false, reason: 'That device credential is not enrolled.' };
  }

  const challenge = readClientDataChallenge(input.response.response.clientDataJSON);
  if (!challenge) {
    return { ok: false, reason: 'The device response carried no challenge.' };
  }
  if (!(await consumeChallenge(challenge, 'authenticate', input.deviceFingerprint))) {
    return { ok: false, reason: 'This sign-in challenge was already used or has expired.' };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      credential: {
        id: stored.credentialId,
        publicKey: fromBase64url(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    return { ok: false, reason: `Device verification failed: ${(error as Error).message}` };
  }

  if (!verification.verified) {
    return { ok: false, reason: 'The device credential could not be verified.' };
  }

  // Some authenticators (including many synced passkeys) always report zero.
  // Only enforce monotonicity when this authenticator actually uses a counter.
  // A non-zero counter that repeats or regresses is a possible clone signal.
  const newCounter = verification.authenticationInfo.newCounter;
  if (stored.counter > 0 && newCounter > 0 && newCounter <= stored.counter) {
    return { ok: false, reason: 'The device credential counter did not advance.' };
  }

  await db
    .update(deviceCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(deviceCredentials.id, stored.id));

  return {
    ok: true,
    deviceId: stored.deviceId,
    backedUp: verification.authenticationInfo.credentialBackedUp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Queries & revocation
// ═══════════════════════════════════════════════════════════════════════════

export async function deviceForFingerprint(fingerprint: string) {
  const rows = await db.select().from(devices).where(eq(devices.fingerprint, fingerprint)).limit(1);
  return rows[0] ?? null;
}

export async function credentialsForUser(userId: string) {
  return db
    .select({
      id: deviceCredentials.id,
      credentialId: deviceCredentials.credentialId,
      createdAt: deviceCredentials.createdAt,
      lastUsedAt: deviceCredentials.lastUsedAt,
      status: deviceCredentials.status,
      backedUp: deviceCredentials.backedUp,
      deviceLabel: devices.label,
      platform: devices.platform,
    })
    .from(deviceCredentials)
    .leftJoin(devices, eq(devices.id, deviceCredentials.deviceId))
    .where(and(eq(deviceCredentials.userId, userId), isNull(deviceCredentials.revokedAt)))
    .orderBy(desc(deviceCredentials.createdAt));
}

export async function revokeDevice(deviceId: string, reason: string): Promise<void> {
  await db
    .update(devices)
    .set({ status: 'revoked', revokedAt: new Date(), revokedReason: reason })
    .where(eq(devices.id, deviceId));

  await db
    .update(deviceCredentials)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(deviceCredentials.deviceId, deviceId));
}

/** Used by the approved device-transfer workflow. */
export async function revokeAllDeviceCredentials(userId: string, reason: string): Promise<void> {
  await db
    .update(devices)
    .set({ status: 'superseded', revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));

  await db
    .update(deviceCredentials)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(and(eq(deviceCredentials.userId, userId), isNull(deviceCredentials.revokedAt)));
}

export async function userById(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}