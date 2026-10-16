'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  checkUsername,
  registerAction,
  type RegisterData,
  type UsernameAvailability,
} from '~/server/actions/auth';
import { fieldError, succeeded, type FormState } from '~/lib/action-result';
import { AGE_BANDS } from '~/lib/domain';
import { PasswordField } from './password-field';
import { PasskeyEnrol } from './passkey-enrol';

/**
 * Registration, in two stages.
 *
 * Stage one validates the account and creates it in a non-active state. Stage
 * two enrols this device with a platform credential, which is what activates it.
 *
 * Keeping them apart means the "this device is already enrolled" refusal lands
 * on a screen that can explain what happened, rather than appearing as an
 * unexplained field error on a form the member has already filled in.
 */

export function RegisterCredentialsForm() {
  const [identity, setIdentity] = useState<{ username: string; memberId: string } | null>(null);
  const [availability, setAvailability] = useState<UsernameAvailability | null>(null);
  const [credentials, credentialsAction, pending] = useActionState<
    FormState<RegisterData> | null,
    FormData
  >(registerAction, null);

  // The action echoes the handle it created, so the enrolment step knows which
  // identity to enrol without the client having to track form state.
  useEffect(() => {
    if (succeeded(credentials) && credentials.data.step === 'device') {
      setIdentity({
        username: credentials.data.username,
        memberId: credentials.data.memberId,
      });
    }
  }, [credentials]);

  if (identity) return <PasskeyEnrol identity={identity} />;

  const usernameError = fieldError(credentials, 'username');
  const deviceBlocked = Boolean(fieldError(credentials, 'device'));

  return (
    <form action={credentialsAction} className="auth-form" noValidate>
      {credentials?.message && !deviceBlocked && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            ⚠
          </span>
          <span>{credentials.message}</span>
        </p>
      )}

      {deviceBlocked && (
        <div className="device-lock">
          <h2>
            <span aria-hidden="true">◈</span> This device is already enrolled
          </h2>
          <p className="t-small t-muted">
            This device is currently associated with another Enyd identity. If you
            believe this is an error, contact Administration.
          </p>
          <p className="t-meta">
            One installation carries one Enyd identity, by design. Account
            switching is not offered.
          </p>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="username">
          Handle
        </label>
        <input
          className="input"
          id="username"
          name="username"
          type="text"
          inputMode="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={3}
          maxLength={24}
          aria-invalid={Boolean(usernameError)}
          aria-describedby="username-hint"
          onChange={(event) => onUsernameChange(event.target.value, setAvailability)}
        />
        <p className="field-hint" id="username-hint">
          Lowercase letters, numbers, dots, hyphens and underscores. This is your
          public identity, and it cannot be changed later.
        </p>
        {availability?.available && !usernameError && (
          <p className="field-hint t-success">That handle is free.</p>
        )}
        {availability && !availability.available && !usernameError && (
          <p className="field-hint">{availability.reason}</p>
        )}
        {usernameError && (
          <p className="field-error" role="alert">
            {usernameError}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="displayName">
          Display name
        </label>
        <input
          className="input"
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="nickname"
          required
          minLength={2}
          maxLength={48}
          aria-invalid={Boolean(fieldError(credentials, 'displayName'))}
          aria-describedby="displayName-hint"
        />
        <p className="field-hint" id="displayName-hint">
          The name other members see. Use whatever you are comfortable being
          called.
        </p>
        {fieldError(credentials, 'displayName') && (
          <p className="field-error" role="alert">
            {fieldError(credentials, 'displayName')}
          </p>
        )}
      </div>

      <PasswordField
        name="password"
        label="Passphrase"
        autoComplete="new-password"
        hint="At least 12 characters. A short phrase you will remember beats a mangled word with symbols in it."
        error={fieldError(credentials, 'password')}
      />

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ padding: 0, marginBottom: 'var(--sp-2)' }}>
          Age group
        </legend>
        <p className="field-hint" style={{ marginBottom: 'var(--sp-3)' }}>
          Enyd Arch never asks for a date of birth. A group is enough, and it is
          used only to keep Connections safe.
        </p>
        <div className="check-list">
          {AGE_BANDS.filter((band) => band.key !== 'u13').map((band) => (
            <label className="check" key={band.key}>
              <input type="radio" name="ageBand" value={band.key} required />
              <span className="check-text">
                <span className="check-title">{band.label}</span>
                <span className="check-desc">{band.note}</span>
              </span>
            </label>
          ))}
        </div>
        {fieldError(credentials, 'ageBand') && (
          <p className="field-error" role="alert">
            {fieldError(credentials, 'ageBand')}
          </p>
        )}
      </fieldset>

      <label className="check">
        <input type="checkbox" name="acceptTerms" required />
        <span className="check-text">
          <span className="check-title">I have read the charter</span>
          <span className="check-desc">
            Be decent. Share only what you have the right to share. Do not use
            this place to harm anyone.
          </span>
        </span>
      </label>
      {fieldError(credentials, 'acceptTerms') && (
        <p className="field-error" role="alert">
          {fieldError(credentials, 'acceptTerms')}
        </p>
      )}

      <button className="btn btn-primary btn-lg btn-mark" type="submit" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        {pending ? 'Checking…' : 'Continue to device enrolment'}
      </button>

      <p className="t-meta" style={{ textAlign: 'center' }}>
        Next: enrol this device with a passkey. That is what keeps your identity
        to one machine.
      </p>
    </form>
  );
}

/**
 * Debounced handle availability.
 *
 * A request per keystroke would be both slow and a way to enumerate handles, so
 * this waits for a pause and fires once per distinct value.
 */
async function onUsernameChange(
  value: string,
  setAvailability: (next: UsernameAvailability | null) => void,
): Promise<void> {
  const normalised = value.trim().toLowerCase();
  if (normalised.length < 3) {
    setAvailability(null);
    return;
  }
  const formData = new FormData();
  formData.set('username', normalised);
  setAvailability(await checkUsername(null, formData));
}