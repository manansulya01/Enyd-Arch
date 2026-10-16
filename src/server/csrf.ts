'use server';

/**
 * Shared helpers for client components that talk to server actions directly.
 *
 * A server action invoked from the browser is still a plain HTTP POST, so it
 * needs a CSRF token the same way a form does. These helpers are thin wrappers
 * because every client component should not be re-deriving the cookie read.
 */

import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '~db';
import { sessions as sessionsTable } from '~db/schema';
import { safeEqual } from '~/server/crypto';

export const CSRF_FIELD = '__csrf';

export class CsrfError extends Error {
  constructor(message = 'This request could not be verified. Reload the page and try again.') {
    super(message);
    this.name = 'CsrfError';
  }
}

/**
 * Origin check.
 *
 * Next.js validates `Origin` against its own action allowlist. This repeats the
 * check against the request's actual host so that a misconfigured proxy or
 * allowlist entry cannot quietly widen it.
 */
export async function assertSameOrigin(): Promise<void> {
  const list = await headers();

  const origin = list.get('origin');
  if (!origin) return; // a same-origin request may legitimately omit Origin

  const host = list.get('x-forwarded-host') ?? list.get('host');
  if (!host) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new CsrfError('This request came from somewhere unexpected.');
  }

  if (originHost !== host) {
    throw new CsrfError('This request came from somewhere unexpected.');
  }
}

/**
 * Resolves the token presented in a submitted form against the session's stored
 * secret, falling back to the anonymous double-submit cookie.
 */
async function tokenMatches(presented: string): Promise<boolean> {
  const store = await cookies();

  const sessionToken = store.get('enyd_session')?.value;
  if (sessionToken) {
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const rows = await db
      .select({ csrfSecret: sessionsTable.csrfSecret })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.tokenHash, tokenHash), isNull(sessionsTable.revokedAt)))
      .limit(1);

    if (rows[0] && safeEqual(presented, rows[0].csrfSecret)) return true;
  }

  const cookieToken = store.get('enyd_csrf')?.value;
  if (cookieToken && safeEqual(presented, cookieToken)) return true;

  return false;
}

/** Verifies a FormData submission. A missing token is always a failure. */
export async function verifyCsrf(formData: FormData): Promise<void> {
  await assertSameOrigin();

  const presented = formData.get(CSRF_FIELD);
  if (typeof presented !== 'string' || presented.length < 16) {
    throw new CsrfError();
  }
  if (!(await tokenMatches(presented))) {
    throw new CsrfError();
  }
}

/**
 * Verifies a bare token, for actions that take structured input rather than
 * form fields — the WebAuthn enrolment ceremony, for example.
 */
export async function verifyCsrfValue(presented: unknown): Promise<void> {
  await assertSameOrigin();

  if (typeof presented !== 'string' || presented.length < 16) {
    throw new CsrfError();
  }
  if (!(await tokenMatches(presented))) {
    throw new CsrfError();
  }
}

/**
 * Issues an anonymous token and mirrors it in a readable cookie, so a form
 * rendered before sign-in can embed it.
 */
export async function issueAnonymousCsrf(): Promise<string> {
  const store = await cookies();
  const existing = store.get('enyd_csrf')?.value;
  if (existing) return existing;

  const token = randomBytes(24).toString('base64url');
  store.set('enyd_csrf', token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 4,
  });
  return token;
}

/** The current session's CSRF secret, for embedding in a hidden field. */
export async function sessionCsrfToken(): Promise<string> {
  const store = await cookies();
  const sessionToken = store.get('enyd_session')?.value;
  if (!sessionToken) return issueAnonymousCsrf();

  const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
  const rows = await db
    .select({ csrfSecret: sessionsTable.csrfSecret })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, tokenHash), isNull(sessionsTable.revokedAt)))
    .limit(1);

  return rows[0]?.csrfSecret ?? issueAnonymousCsrf();
}