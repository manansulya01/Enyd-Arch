'use client';

import { useState } from 'react';

/**
 * A passphrase field with a visibility toggle.
 *
 * The strength meter is advisory copy, not a gate: the server enforces the real
 * policy (length and structure) and reports the specific reason on failure, so
 * there is no value in duplicating a score here that members would try to game.
 */
export function PasswordField({
  name,
  label = 'Password',
  autoComplete = 'current-password',
  hint,
  error,
  minLength = 12,
}: {
  name: string;
  label?: string;
  autoComplete?: string;
  hint?: string;
  error?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');

  const problems: string[] = [];
  if (value.length > 0 && value.length < minLength) {
    problems.push(`${minLength - value.length} more character${minLength - value.length === 1 ? '' : 's'}`);
  }
  if (value.length > 0 && new Set(value).size < 5) {
    problems.push('more variety');
  }
  if (value.length === 0) {
    problems.push(`${minLength} characters`);
  }

  const ready = value.length >= minLength && new Set(value).size >= 5;

  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="input"
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          style={{ paddingRight: '4.5rem' }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ position: 'absolute', right: 4 }}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide passphrase' : 'Show passphrase'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {value.length > 0 && !error && (
        <p
          className="field-hint"
          style={{
            color: ready ? 'var(--moss-200)' : 'var(--brass-200)',
          }}
        >
          {ready
            ? 'Strong enough. A passphrase is better than a complex password.'
            : `Needs ${problems.join(' and ')}.`}
        </p>
      )}

      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}

      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}