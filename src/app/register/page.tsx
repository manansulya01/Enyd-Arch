import type { Metadata } from 'next';
import Link from 'next/link';
import { COPY, MARK } from '~/lib/domain';

export const metadata: Metadata = {
  title: 'Enter the Arch',
  description: 'Create an Enyd identity. One identity, one trusted device.',
};

const APHORISMS = [
  'Enter quietly. Discover freely.',
  'Everything interesting eventually finds its way here.',
  'There is more here than first appears.',
  'Find people worth knowing.',
];

/**
 * Registration, step one.
 *
 * The device policy is stated up front rather than discovered at the end. A
 * member should know what they are agreeing to before they type a username.
 */
export default function RegisterPage() {
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
          <p className="auth-aside-quote">{APHORISMS[0]}</p>
          <p className="t-small t-subtle">
            Enyd Arch is a place members build rather than scroll. You will be
            given a membership number, a name, and one device that becomes
            yours.
          </p>
        </div>

        <p className="t-meta">
          {COPY.privacy.headline} {COPY.privacy.body}
        </p>
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
            <h1 className="auth-title">Enter the Arch</h1>
            <p className="t-small t-muted">
              Five things to begin: a handle, a name, a passphrase, an invitation, and your age
              group. Everything else can wait.
            </p>
          </header>

          <RegisterForm />

          <p className="auth-foot">
            Already have an identity?{' '}
            <Link href="/sign-in">Sign in</Link> ·{' '}
            <Link href="/about">What is this place?</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

async function RegisterForm() {
  const { RegisterCredentialsForm } = await import('~/components/auth/register-credentials-form');
  return <RegisterCredentialsForm />;
}