import { NextResponse } from 'next/server';
import { beginEnrolment } from '~/server/actions/enrolment';

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
  let payload: { username?: string };

  try {
    payload = (await request.json()) as { username?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const username = String(payload.username ?? '').trim();
  if (username.length < 3 || username.length > 32) {
    return NextResponse.json(
      { ok: false, error: 'That identity cannot begin enrolment.' },
      { status: 400 },
    );
  }

  const result = await beginEnrolment(username);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 403 });
  }

  return NextResponse.json(
    { ok: true, options: result.options },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}