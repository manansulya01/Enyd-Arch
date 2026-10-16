import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { COPY, MARK } from '~/lib/domain';
import { currentActor } from '~/server/auth/session';
import { SignInForm } from '~/components/auth/sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Return to the Arch.',
};

export default async function SignInPage() {
  const actor = await currentActor();
  if (actor) redirect(actor.onboarded ? '/home' : '/onboarding');

  return (
    <div className="auth-shell">
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-brand">
          <span className="brand-mark">{MARK}</span>
          <div className="brand-text">
            <span className="brand-name">Enyd Arch</span>
            <span className="brand-sub">A private digital society</span>
          </div>
        </div>

        <div className="auth-aside-body">
          <p className="auth-aside-quote">Welcome back.</p>
          <p className="t-small t-subtle">
            Signing in from a device that is not the one your identity is
            enrolled on is refused by design. If you have genuinely changed
            machines, that is a transfer request, not a sign-in.
          </p>
        </div>

        <p className="t-meta">◈ Private by design.</p>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-card">
          <header className="auth-head">
            <div className="auth-brand">
              <span className="brand-mark">{MARK}</span>
              <div className="brand-text">
                <span className="brand-name">Enyd Arch</span>
              </div>
            </div>
            <h1 className="auth-title">Sign in</h1>
            <p className="t-small t-muted">
              Your handle and passphrase, from your enrolled device.
            </p>
          </header>

          <SignInForm />

          <p className="auth-foot">
            No identity yet? <Link href="/register">Enter the Arch</Link> ·{' '}
            <Link href="/about">What is this place?</Link>
          </p>

          <p className="t-meta" style={{ textAlign: 'center' }}>
            {COPY.device.body}
          </p>
        </div>
      </main>
    </div>
  );
}