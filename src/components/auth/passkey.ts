'use client';

import { startRegistration as webauthnStartRegistration } from '@simplewebauthn/browser';

/**
 * Reads the CSRF token the server placed in a readable cookie.
 *
 * The enrolment action takes structured input rather than form fields, so it
 * cannot carry a hidden input; it presents the same double-submit value
 * explicitly and the server checks both channels.
 */
export function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)enyd_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

/**
 * Thin wrapper over the WebAuthn browser API.
 *
 * Isolating it here keeps every other component free of vendor types, and gives
 * one place to report "this browser cannot do passkeys" rather than three.
 */

export function browserSupportsPasskeys(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
  );
}

export class PasskeyCancelled extends Error {
  constructor() {
    super('Device enrolment was cancelled.');
    this.name = 'PasskeyCancelled';
  }
}

export class PasskeyUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasskeyUnavailable';
  }
}

/**
 * Asks the device to create a credential.
 *
 * `username` is required by the ceremony and is echoed back in the challenge
 * that binds the credential to this account.
 */
export async function startRegistration(username: string): Promise<unknown> {
  if (!browserSupportsPasskeys()) {
    throw new PasskeyUnavailable(
      'This browser cannot create a passkey, so a device cannot be enrolled here.',
    );
  }

  const response = await fetch('/api/device/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    options?: Record<string, unknown>;
    error?: string;
  };

  if (!response.ok || !payload.ok || !payload.options) {
    throw new PasskeyUnavailable(payload.error ?? 'Could not begin device enrolment.');
  }

  try {
    const credential = await webauthnStartRegistration({
      optionsJSON: payload.options as never,
    });
    return credential;
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new PasskeyCancelled();
    }
    throw error;
  }
}