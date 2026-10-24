# Enyd Arch privacy architecture and release gates

This is an engineering contract for privacy work, not a claim that every control below already exists. Privacy is a system property: application code, database schema, hosting, observability, backups, moderation workflows, and client devices all matter.

## Privacy goals

1. **Collect less.** Do not collect analytics, advertising identifiers, precise location, canvas/audio/WebGL fingerprints, screen dimensions, or hardware traits unless a documented feature genuinely requires them and members explicitly opt in.
2. **Keep identity compartmentalized.** Public handles and membership IDs should not expose email, legal name, precise age, IP address, device identifier, or other private account data.
3. **Make access explicit.** Every page, server action, API, search result, notification, attachment, export, and object download must enforce the same authorization, block, removal, and membership rules server-side.
4. **Encrypt with a threat model.** Use TLS in transit, managed encryption for databases/backups/storage, and authenticated encryption for stored objects. End-to-end encryption is a separate requirement and cannot be replaced by disk encryption.
5. **Limit retention.** Every personal-data category needs an owner, purpose, retention period, deletion behavior, and backup expiry rule. Avoid indefinite logs by default.
6. **Give members control.** A launch-quality implementation needs verified data export, account deletion, session/device revocation, privacy settings, and clear explanations of what deletion cannot immediately remove.
7. **Be honest about metadata.** A private community is not anonymity. Hosting, proxy, email, push, DNS, and network providers may process metadata. Do not promise invisibility or resistance to lawful process.

## Current implemented minimization

- Browser screen, timezone, hardware concurrency, color depth, and similar fingerprinting collection was removed.
- Authentication/device records store a coarse browser/platform label instead of the full user-agent string.
- Application audit records store a keyed pseudonym of the address instead of a raw address. Rate limiting may process address data transiently; deployment providers can have their own logs.
- New uploaded objects use AES-256-GCM authenticated encryption at rest, with a separate storage key. This does not hide file contents from the running server.
- Private routes and object/file responses use no-store controls; the app uses a CSP nonce and a restrictive referrer policy.
- Private messaging is **not** end-to-end encrypted. The server/database can read message content.
- A universal self-service export and verified erasure workflow is **not yet guaranteed** for every table, external provider, and backup.

## Required work before describing Enyd Arch as privacy-first

### A. Private messaging and encrypted content

- Choose a maintained, independently reviewed end-to-end protocol/library; do not invent a cryptographic protocol.
- Define identity keys, prekeys, device addition/removal, key transparency or verification, group membership changes, message history migration, recovery, and lost-device behavior before implementation.
- Ensure the server stores only ciphertext and minimal routing metadata for E2EE conversations. Push notifications must not leak message bodies by default.
- Decide how abuse reporting works: user-initiated, selective plaintext disclosure of reported messages, clear notice, and no silent server-side decryption.
- Add protocol vectors, multi-device tests, replay/tampering tests, key-change warnings, group membership tests, and independent cryptographic review.
- Clearly separate E2EE conversations from legacy/non-E2EE content until migration is complete. Never label the current messaging system E2EE.

### B. Data inventory, export, deletion, and retention

- Inventory every database table, object-store prefix, search index, email/push provider, audit record, moderation report, and analytics/monitoring integration.
- Implement a versioned export of a member's data with strict re-authentication, authorization, rate limits, short-lived download links, no-store headers, and audit of the export event without logging the export contents.
- Implement account deletion as an idempotent workflow: revoke sessions and credentials first; remove or anonymize owned content according to explicit policy; handle direct/group messages and other participants' legitimate records carefully; purge object-store objects, thumbnails, derived files, indexes, caches, and provider-side records where supported.
- Define a short, documented retention schedule for security logs, abuse reports, invitation redemption metadata, quarantined uploads, deleted-account tombstones, and backups. Automate expiration and test it.
- Keep backups encrypted and access-restricted; deletion from live tables does not instantly erase immutable backups. Document the backup expiry window and prevent restored backups from resurrecting deleted accounts without replaying deletion records.
- Add member-facing controls for account export/deletion and explain exceptions before confirmation.

### C. Authentication and account privacy

- Use passkeys/WebAuthn where practical, strong password hashing, rate limits, CSRF protection, session rotation, short-lived sensitive-action re-authentication, and a visible session/device revocation screen.
- Review account recovery as a primary attack surface; recovery must not silently bypass passkey or device policy.
- Avoid logging raw email addresses, usernames, tokens, request bodies, invitation codes, credentials, or message text. Use allowlisted structured log fields and redact by construction.
- Minimize account enumeration in login, invitation, recovery, and registration responses.
- Keep private email/contact fields out of public profile and search responses.

### D. Infrastructure and supply chain

- Force HTTPS with HSTS after verifying the production domain; configure secure cookies, a trusted proxy chain, strict CSP, and no permissive CORS.
- Keep database and object storage private, use least-privilege credentials, separate development/staging/production secrets, rotate credentials with rehearsed migrations, and store keys in a managed secret/KMS service.
- Encrypt database snapshots and backups; regularly restore into an isolated environment and verify access controls after restoration.
- Pin dependencies, run production dependency and secret scanning, protect CI permissions, require review for security-sensitive changes, and produce an SBOM/release provenance.
- Configure a real malware scanner and fail closed on scanner outages. Keep quarantined content inaccessible to every preview/download path.
- Restrict production shell/database access, require MFA for administrators, audit privileged access, and define incident response and breach notification procedures.
- Avoid third-party analytics, ad trackers, remote fonts, embedded widgets, and external resources by default. Any exception requires documented purpose, data-flow review, and opt-in where appropriate.

### E. Authorization and adversarial verification

- Test every resource type with anonymous, owner, unrelated member, blocked member, removed account, moderator, and administrator identities.
- Cover IDOR/BOLA, stale cache leakage, SSRF, XSS, CSRF, SQL injection, path traversal, upload polyglots, race conditions, invitation redemption, privilege changes, and session fixation.
- Verify privacy headers and actual rendered CSP in a production-like deployment; automated unit tests alone are insufficient.
- Run an independent penetration test and cryptographic review before making strong security claims.

## Release policy

A passing CI run is evidence for that commit's automated checks, not proof of security. Do not claim “fully anonymous,” “unhackable,” “zero tracking,” “private from the operator,” or “end-to-end encrypted” unless the exact claim has been independently verified and is true for the deployed configuration. If a required privacy gate is not complete, disclose the limitation and do not market the feature as complete.
