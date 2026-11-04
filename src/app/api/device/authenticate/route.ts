import { NextResponse } from 'next/server';
import { beginAuthentication } from '~/server/auth/webauthn';
import { acquire } from '~/server/auth/rate-limit';
import { requestTraits } from '~/server/crypto';
import { verifyCsrf } from '~/server/csrf';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { csrf?: string } | null;
  if (!payload) return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });

  const formData = new FormData();
  formData.set('__csrf', String(payload.csrf ?? ''));
  try {
    await verifyCsrf(formData);
  } catch {
    return NextResponse.json({ ok: false, error: 'This request could not be verified.' }, { status: 403 });
  }

  const traits = await requestTraits();
  const limiter = await acquire('signIn', traits.ipHash);
  if (!limiter.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }

  const begun = await beginAuthentication({
    deviceFingerprint: traits.fingerprint,
    userAgent: traits.userAgent,
  });
  return NextResponse.json({ ok: true, options: begun.options }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
