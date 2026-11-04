import { NextResponse } from 'next/server';
import { beginEnrolment } from '~/server/actions/enrolment';
import { verifyCsrf } from '~/server/csrf';

/**
 * Issues the WebAuthn registration challenge.
 *
 * A route handler rather than a server action because the browser library wants
 * plain JSON, and because challenge issuance must never be cached.
 *
 * The username is the only input. Nothing about the requesting account is
 * revealed beyond whether enrolment is possible — the error messages are
 * deliberately uniform.
 */
export async function POST(request: Request) {
  let payload: { username?: string; password?: string; csrf?: string };

  try {
    payload = (await request.json()) as { username?: string; password?: string; csrf?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const formData = new FormData();
  formData.set('__csrf', String(payload.csrf ?? ''));
  try {
    await verifyCsrf(formData);
  } catch {
    return NextResponse.json({ ok: false, error: 'This request could not be verified.' }, { status: 403 });
  }

  const username = String(payload.username ?? '').trim();
  const password = String(payload.password ?? '');
  if (username.length < 3 || username.length > 32 || password.length < 1 || password.length > 512) {
    return NextResponse.json(
      { ok: false, error: 'That identity cannot begin enrolment.' },
      { status: 400 },
    );
  }

  const result = await beginEnrolment(username, password);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 403 });
  }

  return NextResponse.json(
    { ok: true, options: result.options },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}