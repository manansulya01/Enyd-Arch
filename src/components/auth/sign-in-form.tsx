'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { signInAction } from '~/server/actions/auth';
import { fieldError } from '~/lib/action-result';
import { PasswordField } from './password-field';

export function SignInForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [result, formAction, pending] = useActionState(signInAction, null);

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

      <p className="auth-foot">
        Enrolment is completed during registration. If you are moving to a new
        machine, request a device transfer from your current device first.
      </p>
    </form>
  );
}