# Enyd Arch

Enyd Arch is an invitation-led digital community built with Next.js, React, PostgreSQL, and Drizzle ORM.

## Development

1. Install Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL` to a dedicated PostgreSQL database and generate a unique `AUTH_SECRET` (for example, `openssl rand -base64 48`).
4. Install dependencies with `pnpm install --frozen-lockfile`.
5. Apply the schema using the project's reviewed Drizzle workflow, then start with `pnpm dev`.

Do not run `db:reset` against a database containing data you need; it is destructive. Never use development credentials in production.

## Verification

- `pnpm lint` — TypeScript check.
- `pnpm build` — production build.
- Pull requests run the repository's CI verification workflow.

## Privacy and security model

- Membership is invitation-led; private pages still require server-side authorization.
- Public identity is designed around a handle, display name, and membership number.
- Passkeys use WebAuthn. The server stores public credential material, not the authenticator's private key.
- A random first-party installation cookie binds a browser profile; it is not hardware attestation or anonymity.
- Uploaded files must pass type validation and the configured scanning pipeline before release.
- Security headers include a per-response CSP nonce, a restrictive referrer policy, and no-store caching for private responses and objects.
- Search-engine directives are not access control. Keep private data out of public repositories, logs, URLs, and analytics.
- **Messages are not end-to-end encrypted in the current implementation.** Treat them as visible to the service operator and database until a vetted E2EE design is implemented and tested.
- A private community is not absolute anonymity. Hosting providers and network operators may process connection metadata, and account activity is internally associated with an account for moderation and safety.

## Production release gates

Before a real launch, verify on a backed-up staging environment:

1. Apply and review database migrations; confirm there are no default or predictable invitation credentials.
2. Exercise invitation expiry, revocation, use limits, and concurrent redemption.
3. Test passkey enrollment, sign-in, revocation, device transfer, and recovery on supported browsers.
4. Test every page, server action, API route, and file download for authorization and blocked-member access.
5. Configure a real malware scanner and external object storage if required; confirm scanner outages fail closed.
6. Verify HTTPS, secrets management, database backups/restores, retention, incident response, monitoring, and log access.
7. Run dependency/security review and adversarial tests; do not treat CI success as a security certification.
8. Change repository visibility to private before storing private planning, deployment configuration, or sensitive issue details here.

See [SECURITY_STATUS.md](./SECURITY_STATUS.md) for known limitations and release blockers.
