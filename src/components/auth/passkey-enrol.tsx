'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PasskeyCancelled,
  browserSupportsPasskeys,
  startRegistration,
} from './passkey';
import { completeEnrolment } from '~/server/actions/auth';

/**
 * Device enrolment.
 *
 * The account exists but is inactive at this point; this step binds it to one
 * device using a platform credential, and only then does it become usable. That
 * ordering is what makes "one account, one device" true rather than aspirational
 * — and what means a refused device cannot leave a half-usable account behind.
 *
 * There is no fallback path. A browser without an authenticator cannot enrol,
 * and the screen says so plainly instead of quietly weakening the rule.
 */
export function PasskeyEnrol({
  identity,
  csrfToken,
}: {
  identity: { username: string; memberId: string };
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const supported = browserSupportsPasskeys();

  async function enrol() {
    setLocalError(null);

    try {
      const credential = await startRegistration(identity.username, password, csrfToken);

      startTransition(async () => {
        const result = await completeEnrolment({
          username: identity.username,
          credential,
          csrf: csrfToken,
        });

        if (result.ok) {
          router.push('/onboarding');
          router.refresh();
          return;
        }
        setLocalError(result.message ?? 'The device could not be enrolled.');
      });
    } catch (error) {
      if (error instanceof PasskeyCancelled) {
        setLocalError('Device enrolment was cancelled. Nothing has changed.');
        return;
      }
      setLocalError((error as Error).message || 'The device declined to enrol.');
    }
  }

  return (
    <div className="passkey-prompt">
      <span className="passkey-glyph" aria-hidden="true">
        ◎
      </span>

      <div>
        <h2 className="t-section">Enrol this device</h2>
        <p className="t-small t-muted" style={{ marginTop: 'var(--sp-2)' }}>
          Your membership number is{' '}
          <span className="t-mono t-accent">{identity.memberId}</span>. This is the
          only device your identity will be used from.
        </p>
      </div>

      <div className="device-lock">
        <h2>
          <span aria-hidden="true">◈</span> Your Enyd identity
        </h2>
        <p className="t-small t-muted">
          Your Enyd identity is associated with one trusted device. This helps
          prevent account sharing and keeps membership personal. Device changes
          require Administration approval.
        </p>
        <p className="t-meta">
          A passkey is created by your device — your phone, laptop, or a security
          key. Enyd Arch never sees the private half of it, so nobody can
          reconstruct your credential from our data.
        </p>
      </div>

      {!supported && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>This browser cannot create a passkey.</strong>
            <br />
            Enrolment needs a current version of Chrome, Edge, Safari 16+, or
            Firefox with an authenticator. Try a different browser or device.
          </span>
        </p>
      )}

      {localError && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            ⚠
          </span>
          <span>{localError}</span>
        </p>
      )}

      <label className="field">
        <span className="field-label">Confirm your passphrase</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <span className="field-hint">Re-enter your passphrase to prove you own this pending identity before a device credential can be issued.</span>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-mark"
        onClick={enrol}
        disabled={busy || !supported || password.length === 0}
      >
        {busy && <span className="spinner" aria-hidden="true" />}
        {busy ? 'Waiting for your device…' : 'Enrol this device'}
      </button>

      <p className="t-meta" style={{ maxWidth: '40ch' }}>
        Your browser will ask you to confirm with a fingerprint, face, or device
        PIN. That confirmation is what proves the device is yours.
      </p>
    </div>
  );
}