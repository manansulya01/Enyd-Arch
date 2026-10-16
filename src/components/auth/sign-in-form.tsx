'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInAction, signInWithPasskey } from '~/server/actions/auth';
import { PasskeyCancelled, browserSupportsPasskeys, startPasskeyAuthentication } from './passkey';
import { fieldError } from '~/lib/action-result';
import { PasswordField } from './password-field';

export function SignInForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState(signInAction, null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  async function passkeySignIn() {
    setPasskeyPending(true);
    setPasskeyError(null);
    try {
      const credential = await startPasskeyAuthentication(csrfToken);
      const outcome = await signInWithPasskey({ credential, csrf: csrfToken });
      if (outcome.ok) {
        router.replace('/home');
        router.refresh();
      } else {
        setPasskeyError(outcome.message ?? 'The passkey could not sign in.');
      }
    } catch (error) {
      setPasskeyError(error instanceof PasskeyCancelled ? 'Passkey sign-in was cancelled.' : (error as Error).message || 'Passkey sign-in failed.');
    } finally {
      setPasskeyPending(false);
    }
  }

  // A successful sign-in is a redirect decided by the action; reaching here
  // with ok means the cookie landed and we can refresh the shell.
  if (result?.ok) {
    router.replace('/home');
    router.refresh();
  }

  const identifierError = fieldError(result, 'identifier');
  const passwordError = fieldError(result, 'password');
  const deviceError = fieldError(result, 'device');

  return (
    <form action={formAction} className="auth-form" noValidate>
      <input type="hidden" name="__csrf" value={csrfToken} />
      {result?.message && !identifierError && !passwordError && !deviceError && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            ⚠
          </span>
          <span>{result.message}</span>
        </p>
      )}

      <div className="field">
        <label className="field-label" htmlFor="identifier">
          Handle
        </label>
        <input
          className="input"
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={Boolean(identifierError)}
          aria-describedby="identifier-hint"
        />
        <p className="field-hint" id="identifier-hint">
          The handle you registered with, not your display name.
        </p>
        {identifierError && (
          <p className="field-error" role="alert">
            {identifierError}
          </p>
        )}
      </div>

      <PasswordField
        name="password"
        label="Passphrase"
        autoComplete="current-password"
        error={passwordError}
      />

      {deviceError && (
        <div className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>This identity belongs to a different device.</strong>
            <br />
            {deviceError}
          </span>
        </div>
      )}

      <button className="btn btn-primary btn-lg btn-mark" type="submit" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        {pending ? 'Checking…' : 'Sign in'}
      </button>

      <div className="stack stack-2">
        <button className="btn btn-secondary btn-lg" type="button" onClick={() => void passkeySignIn()} disabled={pending || passkeyPending || !browserSupportsPasskeys()}>
          {passkeyPending && <span className="spinner" aria-hidden="true" />}
          {passkeyPending ? 'Waiting for passkey…' : 'Sign in with passkey'}
        </button>
        {passkeyError && <p className="notice notice-danger" role="alert">{passkeyError}</p>}
      </div>

      <p className="auth-foot">
        Enrolment is completed during registration. If you are moving to a new
        machine, request a device transfer from your current device first.
      </p>
    </form>
  );
}