# Security status and release blockers

This file records implementation facts, not promises. A route or interface is not proof that a deployment is secure.

## Implemented in the current work branch

- Registration requires a valid invitation; codes are limited by use count and expiry, can be revoked, and creation/revocation is audited.
- The predictable founding invitation is no longer seeded.
- The development seed refuses to run when `NODE_ENV=production`.
- WebAuthn challenge consumption requires a live, unused challenge.
- Passkey enrollment is restricted to accounts in an enrollment state and the schema enforces one non-revoked credential per account.
- Passkey sign-in verifies a WebAuthn assertion and checks the enrolled installation binding.
- Browser screen, timezone, and hardware-concurrency fingerprint collection was removed. A random first-party installation cookie is used instead. This cookie is a browser-profile binding, not proof of physical hardware identity.
- Anonymous forms use short-lived signed CSRF tokens; same-origin checks remain in place.
- The middleware creates a per-response CSP nonce and removes the script `unsafe-inline` exception. Style inline allowances remain for application compatibility.
- Referrer policy is set to `no-referrer`; private responses and object/file downloads are marked `private, no-store`.
- New stored objects use AES-256-GCM authenticated encryption at rest. Legacy plaintext objects are checksum-verified and lazily re-encrypted when read; `pnpm storage:encrypt-existing` provides a bulk migration for untouched legacy objects. Production requires a separately managed `STORAGE_ENCRYPTION_KEY`; losing or rotating it without a re-encryption plan makes encrypted files unreadable. This does not encrypt messages end-to-end or prevent the running application from reading files.
- A privacy notice explains the limits of anonymity, message confidentiality, and deployment-level logging.
- A member-facing JSON account export is available from Privacy Settings. It is authenticated, rate-limited, marked private/no-store, and records an audit event without recording export contents. It includes account/profile/settings and many social, message-authored, file-metadata, Archive, Gallery, community, event, film/watchlist, music, Arcade, and project records; the coverage still needs a table-by-table completeness review, and it does not bundle binary file contents or external-provider/backup data.
- Authentication/device records retain coarse browser/platform labels rather than the full user-agent string; audit records use keyed IP pseudonyms instead of persisting raw IP addresses.
- `PRIVACY_ARCHITECTURE.md` defines privacy engineering requirements for E2EE, data export/erasure, retention, infrastructure, and adversarial release gates.
- A robots route and `X-Robots-Tag` ask search engines not to index the site. These are not access controls.
- CI synchronizes the PostgreSQL schema, runs TypeScript checking and security/storage regression tests, audits production dependencies, and builds the app. A successful run only validates the commit it checked.
- Blocking is now checked in direct-message creation/sending and in feed, post-detail, archive, gallery, game, event, project, comment, and stored-media visibility paths. These code-level guards still need adversarial integration tests.
- Unonboarded accounts now receive read-only capabilities even if an elevated role was assigned early.
- Direct and group conversation creation share a recipient-policy decision; group invitations cannot bypass a recipient's `nobody` or `connections only` setting.
- Direct conversation creation is transactionally serialized per user pair to prevent duplicate threads; group creation and membership creation are atomic. Small groups now support owner-only rename, ownership transfer, member removal, and safe leave/close flows with CSRF, rate limits, active membership checks, and transactional locks.
- Community post/comment creation and voting now revalidate and lock current membership in the same transaction as the write, preventing membership removal from racing a stale authorization check.
- Arcade detail lookup is slug-scoped instead of scanning only the top 60 games, and listings/object retrieval exclude games owned by inactive or removed accounts.
- The dependency lockfile now resolves Next.js to 15.5.28, Zod to 4.6.6, and PostCSS to 8.5.23 to address the audit findings observed during this work. A CI run at commit `73fcfc304c6a3d9ca7c6024ce1a0d64e68f610e8` passed type-checking, security regression tests, the production dependency audit, and the production build. Later code changes still require their own successful verification.

## Not yet complete — do not claim otherwise

- **Private messages are not end-to-end encrypted.** Message bodies are currently readable by the application server and database. HTTPS and database/volume encryption do not change that. Do not advertise E2EE until a vetted protocol/library, device-key lifecycle, multi-device/recovery behavior, and adversarial tests are implemented.
- The JSON self-service export exists but is not yet certified complete across every database table, object-store derivative, third-party provider, and backup. Account erasure is not implemented as a verified self-service workflow. Define and test retention and backup-expiry policies before launch.
- The installation cookie is not hardware attestation. Passkeys prove possession of a credential, but the broader account-recovery and device-transfer process still needs end-to-end testing.
- **Object-level visibility has been hardened but still needs adversarial verification.** `/objects/[id]` now checks that a live, readable profile, archive item, collection, project, conversation, approved game, published gallery post, event, film, or eligible file attachment references the object. Orphaned objects fail closed. This is a substantial authorization fix, not proof that every resource-specific rule (for example block relationships or unusual attachment paths) is correct; test cross-member access for each resource type before launch.
- The one-active-credential database index requires the schema to be applied to the deployment database. Back up first and inspect existing credentials before applying schema changes.
- Email verification, push delivery, external storage, malware scanning, and production monitoring are not assumed to be configured merely because related code or environment variables exist.
- The repository is public unless its owner changes visibility in GitHub settings. Search-engine directives do not protect source code or private data.
- The CSP nonce implementation and the full production build must pass CI before merge; inspect actual response headers and verify Next.js inline bootstrap scripts in a staging deployment.
- CI success does not replace live tests for invitation redemption races, passkey enrollment/sign-in, device transfer, blocked-member visibility, private file access, moderation permissions, backup restoration, and account deletion.
- No implementation can promise absolute anonymity from hosting providers, network operators, administrators with production access, or legal process. The product must not describe itself as untraceable.

## Before launch

1. Apply and inspect the database schema change on a backed-up staging database.
2. Store `STORAGE_ENCRYPTION_KEY` in a secrets manager, back it up under a separate access policy, run `pnpm storage:encrypt-existing` on the production storage driver, confirm zero failures, and test restoring encrypted objects before launch.
3. Create a fresh owner account and verify that no default password or predictable invite can enter production.
4. Exercise invite expiry, revocation, exhaustion, and simultaneous final-use redemption.
5. Test passkey enrollment and sign-in on supported browsers; verify a different browser profile is refused unless the approved transfer flow is used.
6. Review authorization for every page, server action, API route, and object/file download. Include block/unblock races, existing direct threads, group membership, repost previews, and every media parent type.
7. Configure a real malware scanner and verify scanner outages fail closed; confirm quarantine objects cannot be downloaded or previewed.
8. Verify HTTPS, secrets management, backup restoration, log access/retention, monitoring, and incident response.
9. Keep E2EE, anonymity, and hardware-bound identity claims out of user-facing copy until independently verified.
