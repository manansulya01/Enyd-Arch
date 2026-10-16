/**
 * Authentication actions.
 *
 * Order of concerns for every credential path:
 *   rate limit → validate → verify → apply device policy → create session
 *
 * The device policy is the distinguishing part: Enyd Arch binds one account to
 * one device, and every way into an account has to decide what happens when the
 * device is already spoken for.
 */
'use server';

import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '~db';
import {
  devices,
  deviceCredentials,
  deviceTransferRequests,
  innerArchMembers,
  invitationRedemptions,
  invitations,
  users,
  userSettings,
} from '~db/schema';
import { fail, issuesToErrors, ok, type ActionResult, type FormState } from '~/lib/action-result';
import { AGE_BAND_BY_KEY, formatMemberId, titleCase } from '~/lib/domain';
import {
  browserLabel,
  ipPseudonym,
  platformLabel,
  requestTraits,
} from '~/server/crypto';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '~/server/auth/password';
import { acquire, gate } from '~/server/auth/rate-limit';
import { createSession, currentActor, revokeSession } from '~/server/auth/session';
import { writeAudit } from '~/server/security/audit';
import { verifyCsrf } from '~/server/csrf';
import { grantInnerArch } from '~/server/society';
import { nextMemberNumber } from '~/server/member-number';

// ═══════════════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════════════

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'enyd', 'arch', 'archivist', 'staff',
  'mod', 'moderator', 'owner', 'support', 'help', 'about', 'privacy', 'safety',
  'settings', 'login', 'signin', 'register', 'sign-out', 'api', 'commons', 'archive',
  'arcade', 'gallery', 'network', 'messages', 'projects', 'events', 'cinema',
  'connections', 'exchange', 'inner-arch', 'chronicle', 'registry', 'home', 'me',
  'search', 'notifications', 'null', 'undefined', 'anonymous', 'deleted', 'default',
  'you', 'everyone', 'nobody', 'official', 'verified', 'me',
]);

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(24, 'Use at most 24 characters.')
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
    'Lowercase letters, numbers, dots, hyphens and underscores only. Must start and end with a letter or number.',
  )
  .refine((value) => !RESERVED.has(value), 'That name is reserved.');

const registerSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(2, 'Choose a name of at least 2 characters.')
    .max(48, 'Keep it under 48 characters.'),
  password: z.string().min(1, 'Choose a password.'),
  ageBand: z.string().min(1, 'Select your age group.'),
  invitationCode: z.string().trim().max(32).optional(),
  acceptTerms: z.literal('on', { message: 'Please read and accept the charter.' }),
});

const signInSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export interface DeviceConflict {
  kind: 'device_enrolled';
  enrolledSince: Date | null;
  deviceLabel: string;
  accountAge: number;
}

export interface UsernameAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Redeems a required invitation code. Invalid, expired, revoked, exhausted, or
 * concurrently claimed codes fail closed so registration cannot bypass the gate.
 */
async function redeemInvitation(code: string, userId: string, ip: string): Promise<boolean> {
  const rows = await db
    .select({
      id: invitations.id,
      tier: invitations.tier,
      uses: invitations.uses,
      maxUses: invitations.maxUses,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.code, code.trim().toUpperCase()),
        isNull(invitations.revokedAt),
        lt(invitations.uses, invitations.maxUses),
        or(isNull(invitations.expiresAt), gt(invitations.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const invitation = rows[0];
  if (!invitation) return false;

  // Increment first: a concurrent redemption loses the race rather than both
  // succeeding against the same remaining use.
  const claimed = await db
    .update(invitations)
    .set({ uses: invitation.uses + 1 })
    .where(
      and(
        eq(invitations.id, invitation.id),
        eq(invitations.uses, invitation.uses),
        isNull(invitations.revokedAt),
        lt(invitations.uses, invitations.maxUses),
        or(isNull(invitations.expiresAt), gt(invitations.expiresAt, new Date())),
      ),
    )
    .returning({ id: invitations.id });

  if (!claimed[0]) return false;

  await db.insert(invitationRedemptions).values({
    invitationId: invitation.id,
    userId,
  });

  if (invitation.tier === 'inner_arch') {
    await grantInnerArch(userId, null, 'Invited at registration.');
  }

  await writeAudit(
    { id: userId, label: 'registration', ip },
    { action: 'invitation.redeemed', targetType: 'invitation', targetId: invitation.id },
  );
  return true;
}

export async function checkUsername(
  _previous: UsernameAvailability | null,
  formData: FormData,
): Promise<UsernameAvailability> {
  const parsed = usernameSchema.safeParse(String(formData.get('username') ?? '').trim());
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message ?? 'Not a usable username.' };
  }
  return { available: (await usernameFree(parsed.data)) };
}

async function usernameFree(username: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return rows.length === 0;
}

export type RegisterState =
  | { step: 'credentials' }
  | { step: 'device'; username: string }
  | { step: 'complete'; memberId: string };

/**
 * Step one of registration: validate, create the account, and report whether
 * this device is free to enrol.
 *
 * The account is created inactive. It becomes active only once a device
 * credential exists, which is what makes "one account, one device" true rather
 * than aspirational.
 */
export interface RegisterData {
  username: string;
  memberId: string;
  step: 'device';
}

export async function registerAction(
  _previous: FormState<RegisterData> | null,
  formData: FormData,
): Promise<FormState<RegisterData>> {
  await verifyCsrf(formData);

  const traits = await requestTraits();
  const limiter = await gate('register', traits.ipHash);
  if (!limiter.ok) return fail(limiter.message);

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail('Please check the details below.', issuesToErrors(parsed.error.issues));
  }

  const { username, displayName, password, ageBand, invitationCode } = parsed.data;

  if (!invitationCode) {
    return fail('Enyd Arch is invite-only.', {
      invitationCode: ['Enter an invitation code from an existing member.'],
    });
  }

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    return fail('Choose a stronger passphrase.', { password: policy.problems });
  }

  // The age band must exist on the ladder; anything else is refused rather than
  // stored, because the safety engine reads this field and nothing else.
  if (!AGE_BAND_BY_KEY[ageBand]) {
    return fail('Select your age group.', { ageBand: ['Choose one of the listed groups.'] });
  }

  if (!(await usernameFree(username))) {
    return fail('That username is already taken.', { username: ['Already taken.'] });
  }

  const device = await db
    .select({
      id: devices.id,
      label: devices.label,
      platform: devices.platform,
      enrolledAt: devices.enrolledAt,
      status: devices.status,
      userId: devices.userId,
      accountStatus: users.status,
      accountCreatedAt: users.createdAt,
    })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .where(
      and(
        eq(devices.fingerprint, traits.fingerprint),
        isNull(devices.revokedAt),
        eq(devices.status, 'active'),
      ),
    )
    .limit(1);

  const activeDevice = device.find((row) => row.status === 'active' && !['banned', 'deactivated'].includes(row.accountStatus));

  if (activeDevice) {
    // The device already belongs to an identity. Refuse, and say nothing about
    // who that identity is beyond the fact that it exists.
    await writeAudit(
      { id: activeDevice.userId, label: 'device-owner', ip: traits.ip },
      {
        action: 'device.enrollment_blocked',
        targetType: 'device',
        targetId: activeDevice.id,
        reason: 'A different identity attempted to enrol on this device.',
        metadata: { fingerprint: traits.fingerprint.slice(0, 12) },
      },
    );

    return fail('This device is already enrolled.', {
      device: [
        'This device is already associated with another Enyd identity. Accounts cannot be added or switched on one installation.',
      ],
    });
  }

  // ── Create the account ──────────────────────────────────────────────
  const passwordHash = await hashPassword(password);
  const memberNumber = await nextMemberNumber();

  const [created] = await db
    .insert(users)
    .values({
      memberId: memberNumber,
      username,
      displayName,
      passwordHash,
      ageBand,
      // Under 18 is the only thing the safety engine needs to know here; the
      // fine-grained age decision lives in the age-band ladder itself.
      isMinor: ageBand !== '18' && ageBand !== '20' && ageBand !== '23' && ageBand !== '26',
      status: 'pending_verification',
      level: 'visitor',
      termsAcceptedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning({ id: users.id, memberId: users.memberId });

  await db.insert(userSettings).values({ userId: created!.id });

  // The code is mandatory. If another registration consumes the final use
  // between validation and redemption, roll back this not-yet-active account.
  const invitationRedeemed = await redeemInvitation(invitationCode, created!.id, traits.ip);
  if (!invitationRedeemed) {
    await db.delete(userSettings).where(eq(userSettings.userId, created!.id));
    await db.delete(users).where(eq(users.id, created!.id));
    return fail('That invitation is invalid, expired, revoked, or has no uses left.', {
      invitationCode: ['Check the code with the member who invited you.'],
    });
  }

  await writeAudit(
    { id: created!.id, label: `ARCH-${created!.memberId}`, ip: traits.ip },
    {
      action: 'account.created',
      targetType: 'user',
      targetId: created!.id,
      metadata: { username, ageBand, device: traits.fingerprint.slice(0, 12) },
    },
  );

  // The handle is echoed back because the enrolment step needs to know which
  // identity to bind the device to, and the form state is gone by then.
  return {
    ok: true,
    data: {
      username,
      memberId: `ARCH-${String(created!.memberId).padStart(6, '0')}`,
      step: 'device' as const,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Device enrolment
// ═══════════════════════════════════════════════════════════════════════════

export async function beginEnrollmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ options: Record<string, unknown> }>> {
  await verifyCsrf(formData);

  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const traits = await requestTraits();
  const limiter = await gate('signIn', traits.ipHash);
  if (!limiter.ok) return fail(limiter.message);

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  const account = rows[0];
  if (!account || !(await verifyPassword(account.passwordHash, password))) {
    return fail('That username and passphrase do not match.');
  }

  if (account.status === 'pending_verification') {
    const { beginRegistration } = await import('~/server/auth/webauthn');
    const begun = await beginRegistration({
      userId: account.id,
      username: account.username,
      displayName: account.displayName,
      deviceFingerprint: traits.fingerprint,
      userAgent: traits.userAgent,
    });
    return ok({ options: begun.options });
  }

  return fail('This account already has a device. Sign in instead.');
}

export async function completeEnrollmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ memberId: string }>> {
  await verifyCsrf(formData);

  const username = String(formData.get('username') ?? '').trim();
  const responseRaw = String(formData.get('credential') ?? '');

  const traits = await requestTraits();
  const limiter = await gate('deviceEnroll', traits.ipHash);
  if (!limiter.ok) return fail(limiter.message);

  let credentialResponse: unknown;
  try {
    credentialResponse = JSON.parse(responseRaw);
  } catch {
    return fail('The device response could not be read.');
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      status: users.status,
    })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  const account = rows[0];
  if (!account) return fail('That account no longer exists.');

  const { finishRegistration } = await import('~/server/auth/webauthn');
  const result = await finishRegistration({
    userId: account.id,
    deviceFingerprint: traits.fingerprint,
    deviceLabel: `${browserLabel(traits.userAgent)} on ${platformLabel(traits.userAgent)}`,
    platform: `${platformLabel(traits.userAgent)} · ${browserLabel(traits.userAgent)}`,
    response: credentialResponse as never,
  });

  if (!result.ok) return fail(result.reason);

  // Enrolment is complete: this is the moment the account becomes usable.
  await db
    .update(users)
    .set({
      status: 'active',
      level: 'member',
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
      metadata: { platform: platformLabel(traits.userAgent) },
    },
  );

  return ok({ memberId: `ARCH-${String(account.memberId).padStart(6, '0')}` });
}

// ═══════════════════════════════════════════════════════════════════════════
// Sign in
// ═══════════════════════════════════════════════════════════════════════════

export async function signInAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);

  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail('Enter your username and passphrase.', issuesToErrors(parsed.error.issues));
  }

  const traits = await requestTraits();

  // Two buckets: one per address, one per account, so neither a single client
  // nor a spray across many clients can brute-force one member.
  const perIp = await acquire('signIn', traits.ipHash);
  if (!perIp.allowed) {
    return fail(
      `Too many sign-in attempts from this device. Try again in ${Math.max(1, Math.ceil(perIp.retryAfterSeconds / 60))} minute(s).`,
    );
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      passwordHash: users.passwordHash,
      status: users.status,
      onboardedAt: users.onboardedAt,
      suspensionReason: users.suspensionReason,
    })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${parsed.data.identifier})`)
    .limit(1);

  const account = rows[0];

  // Constant work whether or not the account exists.
  const verified = await verifyPassword(account?.passwordHash ?? null, parsed.data.password);
  if (!account || !verified) {
    if (account) {
      await writeAudit(
        { id: account.id, label: `ARCH-${account.memberId}`, ip: traits.ip },
        {
          action: 'auth.failed',
          targetType: 'user',
          targetId: account.id,
          reason: 'Incorrect passphrase.',
        },
      );
    }
    return fail('That username and passphrase do not match.');
  }

  const perAccount = await acquire('signIn', `user:${account.id}`);
  if (!perAccount.allowed) {
    await writeAudit(
      { id: account.id, label: `ARCH-${account.memberId}`, ip: traits.ip },
      { action: 'auth.throttled', targetType: 'user', targetId: account.id },
    );
    return fail('Too many attempts for this identity. Try again shortly.');
  }

  // ── Account state ───────────────────────────────────────────────────
  switch (account.status) {
    case 'active':
      break;

    case 'pending_verification':
      return fail(
        'This identity has not been enrolled on a device yet. Continue registration to enrol this device.',
      );

    case 're_enrollment':
      // Transfer approved: this device may now enrol.
      return fail(
        'Your device transfer was approved. Continue registration to enrol this device.',
      );

    case 'frozen':
      return fail(
        'This identity is currently held while Administration reviews a request. If you believe this is a mistake, contact Administration.',
      );

    case 'suspended':
      return fail(
        account.suspensionReason
          ? `This identity is suspended: ${account.suspensionReason}`
          : 'This identity is suspended. Contact Administration if you believe this is a mistake.',
      );

    case 'banned':
      return fail('This identity has been permanently closed.');

    case 'deactivated':
      return fail('This identity has been deactivated.');

    default:
      return fail('This identity cannot be signed into.');
  }

  // ── Device policy ───────────────────────────────────────────────────
  const device = await db
    .select({
      id: devices.id,
      status: devices.status,
      fingerprint: devices.fingerprint,
      enrolledAt: devices.enrolledAt,
      revokedReason: devices.revokedReason,
    })
    .from(devices)
    .where(
      and(eq(devices.userId, account.id), isNull(devices.revokedAt)),
    );

  const active = device.filter((row) => row.status === 'active');
  const thisDevice = active.find((row) => row.fingerprint === traits.fingerprint);

  if (!thisDevice && active.length > 0) {
    const enrolledDevice = active[0]!;
    // Signed in correctly, but not from the enrolled device. This is the
    // account-sharing case, and it is refused with an explanation rather than a
    // generic failure.
    await writeAudit(
      { id: account.id, label: `ARCH-${account.memberId}`, ip: traits.ip },
      {
        action: 'auth.wrong_device',
        targetType: 'device',
        targetId: enrolledDevice.id,
        reason: 'Correct passphrase presented from an unenrolled device.',
        metadata: { presented: traits.fingerprint.slice(0, 12) },
      },
    );

    return fail(
      'This identity is associated with a different device. Submit a device transfer request from your current device, or contact Administration if you no longer have it.',
      { device: ['Not the enrolled device for this identity.'] },
    );
  }

  if (thisDevice && thisDevice.status !== 'active') {
    return fail('The device credential for this identity has been revoked.');
  }

  await createSession({
    userId: account.id,
    deviceId: thisDevice?.id ?? null,
    fingerprint: traits.fingerprint,
    ipHash: ipPseudonym(traits.ip),
    userAgent: traits.userAgent,
  });

  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, account.id));

  await writeAudit(
    { id: account.id, label: `ARCH-${account.memberId}`, ip: traits.ip },
    { action: 'auth.succeeded', targetType: 'user', targetId: account.id },
  );

  return ok();
}

/**
 * Passkey sign-in. The credential ID identifies the account; the WebAuthn
 * assertion proves possession of its enrolled authenticator. The existing
 * installation binding is checked as a separate account policy.
 */
export async function signInWithPasskey(input: {
  credential: unknown;
  csrf: string;
}): Promise<ActionResult> {
  const formData = new FormData();
  formData.set('__csrf', input.csrf);
  await verifyCsrf(formData);

  const credential = input.credential as { id?: unknown };
  if (typeof credential?.id !== 'string' || credential.id.length < 8 || credential.id.length > 2048) {
    return fail('The passkey response could not be read.');
  }

  const traits = await requestTraits();
  const perIp = await acquire('signIn', traits.ipHash);
  if (!perIp.allowed) return fail('Too many sign-in attempts. Try again shortly.');

  const rows = await db
    .select({
      userId: deviceCredentials.userId,
      credentialStatus: deviceCredentials.status,
      userStatus: users.status,
      memberId: users.memberId,
      username: users.username,
      onboardedAt: users.onboardedAt,
    })
    .from(deviceCredentials)
    .innerJoin(users, eq(users.id, deviceCredentials.userId))
    .where(and(
      eq(deviceCredentials.credentialId, credential.id),
      eq(deviceCredentials.status, 'active'),
      isNull(deviceCredentials.revokedAt),
    ))
    .limit(1);

  const account = rows[0];
  if (!account || account.userStatus !== 'active') {
    return fail('That passkey could not sign in to an active identity.');
  }

  const perAccount = await acquire('signIn', `user:${account.userId}`);
  if (!perAccount.allowed) return fail('Too many attempts for this identity. Try again shortly.');

  const { finishAuthentication } = await import('~/server/auth/webauthn');
  const verified = await finishAuthentication({
    userId: account.userId,
    deviceFingerprint: traits.fingerprint,
    response: input.credential as never,
  });
  if (!verified.ok) {
    await writeAudit(
      { id: account.userId, label: `ARCH-${account.memberId}`, ip: traits.ip },
      { action: 'auth.passkey_failed', targetType: 'user', targetId: account.userId, reason: verified.reason },
    );
    return fail('The passkey could not be verified. Try again or use your enrolled device.');
  }

  if (!verified.deviceId) return fail('This passkey has no active device assignment.');

  const [device] = await db
    .select({ status: devices.status, fingerprint: devices.fingerprint })
    .from(devices)
    .where(eq(devices.id, verified.deviceId))
    .limit(1);
  if (!device || device.status !== 'active' || device.fingerprint !== traits.fingerprint) {
    return fail('This passkey is not associated with the current enrolled installation.');
  }

  await createSession({
    userId: account.userId,
    deviceId: verified.deviceId,
    fingerprint: traits.fingerprint,
    ipHash: traits.ipHash,
    userAgent: traits.userAgent,
  });
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, account.userId));
  await writeAudit(
    { id: account.userId, label: `ARCH-${account.memberId}`, ip: traits.ip },
    { action: 'auth.passkey_succeeded', targetType: 'user', targetId: account.userId },
  );
  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Sign out
// ═══════════════════════════════════════════════════════════════════════════

export async function signOutAction(): Promise<void> {
  await revokeSession('signed_out');
  const store = await cookies();
  store.delete('enyd_device_traits');
  redirect('/');
}

// ═══════════════════════════════════════════════════════════════════════════
// Device transfer
// ═══════════════════════════════════════════════════════════════════════════

const TRANSFER_REASONS = ['replacing_device', 'lost_device', 'stolen_device', 'damaged', 'other'];

export async function requestDeviceTransferAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);

  const actor = await currentActor();
  if (!actor) return fail('You must be signed in to request a transfer.');

  const reason = String(formData.get('reason') ?? '');
  const explanation = String(formData.get('explanation') ?? '').trim();
  const newDeviceLabel = String(formData.get('newDeviceLabel') ?? '').trim();

  if (!TRANSFER_REASONS.includes(reason)) {
    return fail('Choose a reason for the transfer.', { reason: ['Select one.'] });
  }
  if (explanation.length < 20) {
    return fail('Tell Administration a little more.', {
      explanation: ['At least 20 characters, so a moderator can act on it without asking.'],
    });
  }
  if (explanation.length > 2000) {
    return fail('That explanation is too long.', { explanation: ['Keep it under 2000 characters.'] });
  }

  const pending = await db
    .select({ id: deviceTransferRequests.id })
    .from(deviceTransferRequests)
    .where(
      and(
        eq(deviceTransferRequests.userId, actor.userId),
        eq(deviceTransferRequests.state, 'pending'),
      ),
    )
    .limit(1);

  if (pending[0]) {
    return fail('You already have a transfer request awaiting review.');
  }

  const deviceRows = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, actor.userId), eq(devices.status, 'active')))
    .limit(1);

  await db.insert(deviceTransferRequests).values({
    userId: actor.userId,
    reason,
    explanation,
    fromDeviceId: deviceRows[0]?.id ?? null,
    newDeviceLabel: newDeviceLabel || null,
    state: 'pending',
  });

  const traits = await requestTraits();
  await writeAudit(
    { id: actor.userId, label: formatMemberId(actor.memberId), ip: traits.ip },
    {
      action: 'device.transfer_requested',
      targetType: 'user',
      targetId: actor.userId,
      reason,
    },
  );

  return ok();
}

export { titleCase };

// The enrolment ceremony lives in its own module because it takes structured
// input rather than form fields; re-exported here so client components have one
// import site for authentication.
export { completeEnrolment, beginEnrolment } from './enrolment';