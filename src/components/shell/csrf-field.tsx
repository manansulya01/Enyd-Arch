import { sessionCsrfToken } from '~/server/csrf';

/**
 * Hidden CSRF token for a server action form.
 *
 * Rendered as a server component inside client-side forms so every form that
 * posts a `FormData` action carries a token without the client ever handling
 * it directly.
 */
export async function CsrfField() {
  const token = await sessionCsrfToken();
  return <input type="hidden" name="__csrf" value={token} />;
}
