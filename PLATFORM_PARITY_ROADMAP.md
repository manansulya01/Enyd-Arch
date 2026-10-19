# Enyd Arch platform-parity roadmap

This roadmap translates the request for Discord-, Instagram-, YouTube-, X/Twitter-, Reddit-, Spotify-, Arcade-, and FTP-like capabilities into a staged engineering plan. It is a planning and verification document, **not a claim that all listed capabilities are already implemented**.

## Existing foundations (confirmed in the current repository)

- **Community/social:** member profiles and registry, Connections, requests/blocks, Commons posts, comments, reactions, reposts, hashtags, mentions, polls, bookmarks, notifications, search, gallery, events, projects, and private messages/group conversations.
- **Video/film:** Cinema catalogue, reviews, comments, watchlists, official availability links. This is not yet a general-purpose creator video hosting/transcoding platform.
- **Games:** The Arcade already exists at `/arcade`, with game submission, isolated sandbox playback, genres, ratings, comments, tags, and play counts. Do not build a duplicate Arcade.
- **Files:** The Exchange accepts scanned uploads including audio, video, documents and archives. It is not an FTP/SFTP server, and uploads are not automatically a music catalogue.
- **Security foundation:** passkeys, private-by-default uploads, object access checks, rate limits, moderation and storage encryption at rest. Private messages are not end-to-end encrypted.

## Product principles

1. Implement a coherent Enyd experience, not a pixel-perfect or trademark-copying clone of another service.
2. Prefer open standards and interoperable formats; do not scrape private APIs, bypass DRM, or re-host copyrighted media without permission.
3. Each feature requires a database model, server-side authorization, abuse/reporting controls, accessibility, retention/deletion behavior, tests, and an explicit rollout gate.
4. Keep private content private by default. Public sharing must be an explicit action and all media delivery must enforce the same policy.
5. Do not deploy an unauthenticated FTP daemon. If remote file transfer is enabled, use **SFTP over SSH** or a managed object-storage transfer endpoint with per-user credentials, scoped directories, quotas, audit logs, and revocation. Plain FTP sends credentials in cleartext.

## Feature-parity inventory

### Discord-like community and communication
- [x] Basic direct and small group text conversations (server-side foundation).
- [ ] Conversation UI completeness audit; durable group membership management, rename/leave/remove member flows, invite links, ownership transfer and group permissions.
- [ ] Read receipts, unread markers, message edit/delete, replies, reactions, pinning, search, drafts, attachments previews, retry/offline queue, notification preferences.
- [ ] Typing/presence indicators and real-time delivery (WebSocket/SSE infrastructure; polling is only a fallback).
- [ ] Server/workspace model: channels, roles, permission overwrites, categories, announcements, moderation logs and audit trails.
- [ ] Voice/video rooms, screen sharing, noise controls and call signaling; requires a dedicated media service and capacity/security planning.
- [ ] Community onboarding, custom emoji/stickers, events, polls, scheduled messages, bot/app integrations and scoped API tokens.
- [ ] Spam/raid protection, invite throttling, block/report flows, age safety, rate limits and moderator tooling for every new surface.

### Instagram-like visual social
- [x] Follow/unfollow graph distinct from mutual Connections, discoverable-member controls, and a Following feed.
- [ ] Follower/following lists and additional per-audience privacy controls.
- [ ] Photo/carousel posts, captions, alt text, crop/thumbnail generation, drafts, archive and creator profile grid.
- [ ] Stories with explicit expiry, viewer list privacy, replies and optional close-friends audience.
- [ ] Short-form video/reels, transcoding, adaptive bitrate, captions, audio rights checks and upload resumability.
- [ ] Likes/comments/shares/saves, mentions, tagged media, collaborative posts and creator insights with privacy-conscious analytics.
- [ ] Recommendation/discovery controls, hidden words, comment filters, restrict/mute/block, reporting and copyright takedown workflow.
- [ ] Optional live broadcasts only after media infrastructure and moderation coverage exist.

### YouTube-like video platform
- [ ] Creator channel pages, upload pipeline, resumable uploads and processing states.
- [ ] Transcoding jobs, HLS/DASH adaptive streaming, thumbnails, subtitles/captions, chapters, playback quality and accessibility.
- [ ] Public/unlisted/private visibility, playlists, watch history controls, watch later, subscriptions, notifications and queue.
- [ ] Comments/replies, moderation, pinned comments, clips, timestamps, likes/dislikes or equivalent feedback, community posts.
- [ ] Search/filter/sort, creator dashboard, retention metrics with clear definitions, copyright claims and dispute workflow.
- [ ] Live streaming, chat replay, premieres and memberships only when reliable media/abuse infrastructure exists.
- [ ] No DRM bypass, unauthorized downloads, or unlicensed music/video re-hosting.

### X/Twitter-like public conversation
- [x] Commons text posts, hashtags, mentions, reactions, reposts, polls, bookmarks, comments and active/recent/discussed feeds exist in some form.
- [x] Follow graph and chronological following feed; active/recent/discussed sorting remains user-selectable.
- [ ] Lists, saved searches, trends and additional conversation controls.
- [ ] Quote-posts, threaded long posts, edit window/history, drafts, scheduled posts, post-level audiences and link cards.
- [ ] Lists, saved searches, trends with anti-manipulation protections, advanced search filters and conversation controls.
- [ ] Mute words/accounts, reply permissions, block/report, community notes/context, account verification policy and impersonation reports.
- [ ] Optional audio/video posts with transcoding, alt text and caption requirements.
- [ ] No dark-pattern engagement optimization; document ranking and give users control over recommendation inputs.

### Reddit-like communities
- [ ] Subcommunities with owners/moderators, rules, join/leave, public/restricted/private access and role hierarchy.
- [ ] Text/link/image/video/self posts, flairs, post scheduling, crossposts and per-community feeds.
- [ ] Comment trees, collapse/expand, sorting, voting policy, saved items, awards/reputation without pay-to-win moderation.
- [ ] Community wiki/resources, pinned posts, recurring threads, polls, mod queue, reports, automod rules and appeal history.
- [ ] Community discovery, search, related communities, spam brigades/rate limits and moderator audit logs.
- [ ] Export, delete, and retention behavior for user-generated content and mod actions.

### Spotify-like music experience
- [x] Private music library for clean audio files a member has uploaded and owns.
- [x] Search by filename, browser audio playback, next/previous, shuffle and repeat controls.
- [x] Private playlists with creation, adding/removing tracks, deletion, persisted PostgreSQL membership, server-side ownership checks, write rate limits, and transaction-locked position allocation.
- [x] Select a saved playlist for playback, search within it, and use next/previous/shuffle/repeat against its available tracks.
- [ ] Track metadata beyond filenames, cover art, artist/album pages, genres, persistent playback across navigation and a durable playback queue.
- [x] Private playlist track reordering with ownership checks, transaction locking, and unique-position-safe swaps.
- [ ] Public/collaborative playlists, share links and explicit audience controls.
- [ ] Favorites/liked songs, library, listening history controls, recently played and personal mixes.
- [ ] Audio normalization, range-capable streaming, background playback, metadata/cover extraction and mobile playback behavior.
- [ ] Artist upload rights declaration, copyright reporting, takedown and repeat-infringer process.
- [ ] Recommendations only after transparent opt-in and privacy review.
- [ ] No ripping Spotify, circumventing DRM, or distributing copyrighted tracks without licenses. Commercial catalogue streaming requires licensing and royalty accounting; user uploads alone do not create those rights.

### Arcade
- [x] Existing Arcade at `/arcade`: submissions, package validation/scanning, isolated playback, genre filters, ratings, comments, tags and play counts.
- [ ] Verify per-game sandbox boundaries, resource quotas, CSP, network denial, anti-cheat expectations and moderation/reporting.
- [ ] Add save-state/high scores/leaderboards/achievements, game collections, favorites and controller/mobile accessibility where the game API supports them.
- [ ] Add multiplayer only via an isolated, rate-limited game-session service; do not give games direct database or app-session access.

### FTP/SFTP-style personal file access
- [ ] Define the use case and retention/quota model before exposing remote transfer.
- [ ] Preferred design: SFTP service or scoped object-storage multipart transfer; separate credentials from web sessions, support key rotation/revocation, per-user roots, quotas, malware scanning, audit logs and backup/restore.
- [ ] Never expose raw server filesystem paths, shell access, arbitrary directory traversal, or shared FTP passwords.
- [ ] Use TLS-protected transfers, encrypted storage, quarantine, checksum verification, and explicit public-link expiry/revocation.
- [ ] Add abuse response, per-account transfer limits, disk exhaustion protections and incident logging that avoids file contents and secrets.

## Suggested delivery order

1. **Core quality/security:** verify existing social/chat/Arcade behavior, fix authorization gaps, add integration tests, and complete messaging UX.
2. **Music MVP:** private audio library, permissioned track publishing, playlists, search and safe playback for authorized files.
3. **Community spaces:** Reddit/Discord-inspired communities, channel roles, moderator queues and reporting.
4. **Creator media:** video processing pipeline, captions, playlists, follows/subscriptions and upload-resume.
5. **Visual social:** stories, reels/carousels and creator grids using the same media pipeline.
6. **Advanced realtime:** voice/video, live streaming and multiplayer after separate infrastructure/security reviews.
7. **Remote file transfer:** SFTP/object-storage gateway with strict isolation, quotas and key revocation.
8. **Recommendation and analytics:** opt-in, documented, privacy-preserving, and never required for the core product.

Every phase ends with database migrations, type-check, regression/integration tests, production build, accessibility checks, abuse tests, and a staging rollout. A green unit-test run is not proof of full platform parity or production security.
