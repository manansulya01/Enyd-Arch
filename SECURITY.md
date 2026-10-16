# Security policy

Enyd Arch is intended to be a private, invitation-led community. Security controls are defense in depth; they do not make the service anonymous to its operators or guarantee that every vulnerability is absent.

## Reporting a vulnerability

Do not publish exploit details, member data, credentials, or session tokens in public issues. Contact the repository owner privately through GitHub's supported private vulnerability reporting channel when available. Include affected routes, reproducible steps, impact, and a proposed mitigation without accessing other members' data.

## Production release checklist

- [ ] Use HTTPS end-to-end; configure `APP_ORIGIN` to the exact canonical HTTPS origin.
- [ ] Generate a unique high-entropy `AUTH_SECRET` (for example, `openssl rand -base64 48`). Never commit secrets or reuse development secrets.
- [ ] Use a dedicated least-privilege PostgreSQL role, encrypted backups, restricted network access, and tested restore procedures.
- [ ] Configure and monitor a real malware scanner. Production uploads must fail closed when scanning is unavailable.
- [ ] Store uploaded files outside the web root or in a private object store; never make a bucket public by default.
- [ ] Configure `ARCH_GAME_ORIGIN` on a separate origin with no application cookies, no shared authentication, and no privileged cross-origin access.
- [ ] Set `TRUST_PROXY_HOPS` only to the exact trusted proxy topology. Do not trust arbitrary client-supplied forwarding headers.
- [ ] Review every server action and route for authentication, capability checks, object-level authorisation, input validation, CSRF/origin checks, and safe error handling.
- [ ] Test registration, invitation redemption, session revocation, device transfer, account recovery, moderation, exports, and deletion.
- [ ] Verify private pages, API responses, and member-specific file responses use appropriate no-store cache controls.
- [ ] Run dependency, static-analysis, type-check, production-build, and security regression tests in CI before release.
- [ ] Establish retention limits and deletion jobs for audit records, reports, uploads, notifications, and backups.
- [ ] Publish a jurisdiction-appropriate privacy notice and terms after confirming actual data flows, retention, hosting region, and operator access.

## Privacy claims

- Do not describe the service as anonymous from administrators or infrastructure operators.
- Do not claim end-to-end encryption unless message and file encryption is implemented so the server cannot access plaintext, key management is designed and tested, and the design has been independently reviewed.
- IP pseudonyms, opaque IDs, private routes, robots directives, and HTTPS are useful controls but are not anonymity.
- A `robots.txt` disallow rule is crawler guidance, not access control. Private content must be protected on the server.
- Security headers and code-level controls require deployment verification; a source change alone does not prove production behavior.

## Scope

This policy describes the intended security posture and deployment gates. It is not a claim of certification or a guarantee that the application is vulnerability-free.
