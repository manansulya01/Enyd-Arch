'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '~db';
import { users } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { browserLabel, platformLabel, requestTraits } from '~/server/crypto';
import { gate } from '~/server/auth/rate-limit';
import { createSession } from '~/server/auth/session';
import { verifyPassword } from '~/server/auth/password';
import { writeAudit } from '~/server/security/audit';
import { beginRegistration, finishRegistration } from '~/server/auth/webauthn';

/**
 * Device enrolment
 *
 * Called directly from the client because the WebAuthn assertion is a
 * structured object rather than form fields. This is the single moment an
 * account becomes active: there is no other route to `active`, and no code path
 * grants capabilities without a device credential behind them.
 *
 * The response is the object the browser library produces. It is passed through
 * to the verification library untouched — no manual field mapping, because every
 * mapped field is a chance to drop the field the signature covers.
 */

/** Statuses in which an account is allowed to enrol a device. */
const ENROLLABLE = ['pending_verification', 're_enrollment'];

export async function completeEnrolment(input: {
  username: string;
  credential: unknown;
  csrf: string;
}): Promise<ActionResult<{ memberId: string }>> {
  await verifyCsrfValue(input.csrf);
  const traits = await requestTraits();

  const limiter = await gate('deviceEnroll', traits.ipHash);
  if (!limiter.ok) return fail(limiter.message);

  const accountRows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      status: users.status,
    })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${input.username})`)
    .limit(1);

  const account = accountRows[0];
  if (!account) return fail('That identity no longer exists.');

  // An active account reaching enrolment is either a mistake or an attempt to
  // attach a second device. Refuse; do not re-enrol silently.
  if (!ENROLLABLE.includes(account.status)) {
    return fail('This identity already has an active device.', {
      device: ['This identity is already active on a device. Sign in instead.'],
    });
  }

  const result = await finishRegistration({
    userId: account.id,
    deviceFingerprint: traits.fingerprint,
    deviceLabel: `${browserLabel(traits.userAgent)} on ${platformLabel(traits.userAgent)}`,
    platform: `${platformLabel(traits.userAgent)} · ${browserLabel(traits.userAgent)}`,
    response: input.credential as never,
  });

  if (!result.ok) {
    return fail(result.reason, { device: [result.reason] });
  }

  const reEnrolling = account.status === 're_enrollment';

  await db
    .update(users)
    .set({
      status: 'active',
      // A re-enrolled member keeps whatever level they had; a first enrolment
      // starts at Member.
      ...(reEnrolling ? {} : { level: 'member' as const }),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, account.id));

  await createSession({
    userId: account.id,
    deviceId: result.deviceId,
    fingerprint: traits.fingerprint,
    ipHash: traits.ipHash,
    userAgent: traits.userAgent,
  });

  await writeAudit(
    { id: account.id, label: `ARCH-${account.memberId}`, ip: traits.ip },
    {
      action: 'device.enrolled',
      targetType: 'device',
      targetId: result.deviceId,
      reason: reEnrolling ? 'Approved device transfer.' : 'Initial enrolment.',
      metadata: { platform: platformLabel(traits.userAgent) },
    },
  );

  return ok({
    memberId: `ARCH-${String(account.memberId).padStart(6, '0')}`,
  });
}

/**
 * Issues the registration challenge for the route handler at
 * /api/device/register.
 *
 * Uniform failure messages on purpose: this endpoint must not become an oracle
 * for which handles exist.
 */
export async function beginEnrolment(
  username: string,
  password: string,
): Promise<{ ok: true; options: Record<string, unknown> } | { ok: false; reason: string }> {
  const traits = await requestTraits();

  const limiter = await gate('deviceEnroll', traits.ipHash);
  if (!limiter.ok) return { ok: false, reason: limiter.message };

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  const account = rows[0];
  if (!account || !(await verifyPassword(account.passwordHash, password))) {
    return { ok: false, reason: 'That identity cannot begin enrolment.' };
  }

  if (!ENROLLABLE.includes(account.status)) {
    return {
      ok: false,
      reason: 'This identity is already active on a device. Sign in instead.',
    };
  }

  const begun = await beginRegistration({
    userId: account.id,
    username: account.username,
    displayName: account.displayName,
    deviceFingerprint: traits.fingerprint,
    userAgent: traits.userAgent,
  });

  return { ok: true, options: begun.options };
}