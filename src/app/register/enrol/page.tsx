import type { Metadata } from 'next';
import Link from 'next/link';
import { MARK } from '~/lib/domain';
import { issueAnonymousCsrf } from '~/server/csrf';
import { ExistingEnrollmentForm } from '~/components/auth/existing-enrollment-form';

export const metadata: Metadata = {
  title: 'Finish device enrollment — Enyd Arch',
  description: 'Enroll a passkey for an existing Enyd identity.',
};

export default async function FinishEnrollmentPage() {
  const csrfToken = await issueAnonymousCsrf();
  return (
    <div className="auth-shell">
      <main className="auth-main" id="main">
        <div className="auth-card">
          <header className="auth-head">
            <div className="auth-brand"><span className="brand-mark">{MARK}</span><div className="brand-text"><span className="brand-name">Enyd Arch</span></div></div>
            <h1 className="auth-title">Finish device enrollment</h1>
            <p className="t-small t-muted">Use this for an existing pending identity or a device transfer approved by Administration.</p>
          </header>
          <ExistingEnrollmentForm csrfToken={csrfToken} />
          <p className="auth-foot"><Link href="/sign-in">Back to sign in</Link></p>
        </div>
      </main>
    </div>
  );
}
