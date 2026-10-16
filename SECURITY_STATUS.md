# Security status and release blockers

This file records implementation facts, not promises. A route or interface is not proof that a deployment is secure.

## Implemented in the current branch

- Registration requires a valid invitation; codes are limited by use count and expiry, can be revoked, and creation/revocation is audited.
- The predictable founding invitation is no longer seeded.
- The development seed refuses to run when \`NODE_ENV=production\`.
- WebAuthn challenge consumption now requires a live, unused challenge.
- Passkey enrollment is restricted to accounts in an enrollment state and the schema enforces one non-revoked credential per account.
- Passkey sign-in verifies a WebAuthn assertion and checks the enrolled installation binding.
- Browser screen, timezone, and hardware-concurrency fingerprint collection was removed. A random HttpOnly installation cookie is used instead. This cookie is a browser-profile binding, not proof of physical hardware identity.
- Anonymous forms use short-lived signed CSRF tokens; same-origin checks remain in place.
- CI runs TypeScript checking and a production build.

## Not yet complete — do not claim otherwise

- **Private messages are not end-to-end encrypted.** Message bodies are currently readable by the application server and database. HTTPS and database/volume encryption do not change that. Do not advertise E2EE until a vetted protocol/library, device-key lifecycle, multi-device/recovery behavior, and adversarial tests are implemented.
- The installation cookie is not hardware attestation. Passkeys prove possession of a credential, but the broader account-recovery and device-transfer process still needs end-to-end testing.
- The one-active-credential database index requires the schema to be applied to the deployment database. Back up first and inspect existing credentials before applying schema changes.
- Email verification, push delivery, external storage, malware scanning, and production monitoring are not assumed to be configured merely because related code or environment variables exist.
- The current repository visibility is public. Make it private in GitHub settings before adding private project data or deployment details.
- CI success does not replace live tests for invitation redemption races, passkey enrollment/sign-in, device transfer, blocked-member visibility, private file access, moderation permissions, backup restoration, and account deletion.

## Before launch

1. Apply and inspect the database schema change on a backed-up staging database.
2. Create a fresh owner account and verify that no default password or predictable invite can enter production.
3. Exercise invite expiry, revocation, exhaustion, and simultaneous final-use redemption.
4. Test passkey enrollment and sign-in on supported browsers; verify a different browser profile is refused unless the approved transfer flow is used.
5. Review authorization for every page, server action, API route, and object/file download.
6. Keep E2EE, anonymity, and hardware-bound identity claims out of user-facing copy until independently verified.
