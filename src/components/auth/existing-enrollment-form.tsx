'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { completeEnrolment } from '~/server/actions/enrolment';
import { startRegistration, PasskeyCancelled } from './passkey';

export function ExistingEnrollmentForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const credential = await startRegistration(username.trim(), password, csrfToken);
      const result = await completeEnrolment({ username: username.trim(), credential, csrf: csrfToken });
      if (!result.ok) {
        setError(result.message ?? 'Device enrollment could not be completed.');
        return;
      }
      router.push('/onboarding');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof PasskeyCancelled ? 'Device enrollment was cancelled.' : (cause as Error).message || 'Device enrollment failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="enroll-username">Handle</label>
        <input className="input" id="enroll-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={24} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="enroll-password">Passphrase</label>
        <input className="input" id="enroll-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      </div>
      <p className="field-hint">This is for an identity that already exists but has not enrolled a device yet, or whose device transfer has been approved.</p>
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !username.trim() || !password}>
        {busy ? 'Waiting for your device…' : 'Verify and enrol passkey'}
      </button>
    </form>
  );
}
