/**
 * Enyd Arch · relational model
 *
 * Design rules applied throughout:
 *  - Public identity is (username, displayName, memberId). Legal name, email,
 *    phone, exact birthdate and precise location never leave private columns.
 *  - Binary payloads are never stored in a row; only metadata lives here and
 *    the bytes live behind src/server/storage.
 *  - Every table that participates in a hot query path carries an index.
 *  - Deletable user data is soft-retained (`removedAt`) so moderation history
 *    stays coherent without keeping content publicly reachable.
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ════════════════════════════════════════════════════════════════════════════
// Enumerations
// ════════════════════════════════════════════════════════════════════════════

export const accountStatusEnum = pgEnum('account_status', [
  'pending_verification',
  'active',
  're_enrollment', // device transfer approved; awaiting new device
  'frozen', // admin hold, e.g. lost device
  'suspended',
  'banned',
  'deactivated',
]);

export const deviceStatusEnum = pgEnum('device_status', [
  'active',
  'revoked',
  'superseded',
]);

export const credentialTypeEnum = pgEnum('credential_type', ['webauthn', 'recovery']);

export const memberLevelEnum = pgEnum('member_level', [
  'visitor',
  'member',
  'contributor',
  'creator',
  'archivist',
  'curator',
  'inner_arch',
]);

export const adminRoleEnum = pgEnum('admin_role', [
  'community_moderator',
  'safety_administrator',
  'system_administrator',
  'owner',
]);

export const visibilityEnum = pgEnum('visibility', [
  'public',
  'members', // any signed-in member
  'connections', // only matched connections
  'private',
]);

export const postStatusEnum = pgEnum('post_status', ['published', 'hidden', 'removed']);

export const commentStatusEnum = pgEnum('comment_status', ['published', 'hidden', 'removed']);

export const storageDriverEnum = pgEnum('storage_driver', ['local', 's3']);

export const fileStateEnum = pgEnum('file_state', [
  'quarantined', // awaiting malware verdict
  'clean',
  'infected',
  'rejected',
  'removed',
]);

export const archiveCategoryEnum = pgEnum('archive_category', [
  'knowledge',
  'student_resources',
  'games',
  'music',
  'art',
  'photography',
  'videos',
  'documents',
  'interesting_things',
  'web_discoveries',
  'member_creations',
]);

export const gameStatusEnum = pgEnum('game_status', [
  'submitted',
  'scanning',
  'approved',
  'changes_requested',
  'rejected',
]);

export const galleryKindEnum = pgEnum('gallery_kind', [
  'photography',
  'digital_art',
  'drawing',
  'writing',
  'animation',
  'video_edit',
  'design',
  'music',
]);

export const conversationKindEnum = pgEnum('conversation_kind', ['direct', 'group', 'project']);

export const connectionModeEnum = pgEnum('connection_mode', [
  'friendship',
  'collaboration',
  'dating',
]);

export const matchStatusEnum = pgEnum('match_status', [
  'pending',
  'accepted',
  'declined',
  'unmatched',
  'blocked',
]);

export const eventKindEnum = pgEnum('event_kind', [
  'game_night',
  'movie_night',
  'competition',
  'creative_challenge',
  'study_session',
  'community',
  'game_jam',
  'archive_event',
]);

export const rsvpEnum = pgEnum('rsvp_status', ['going', 'interested', 'declined']);

export const reportTargetEnum = pgEnum('report_target', [
  'user',
  'post',
  'comment',
  'message',
  'archive_object',
  'game',
  'gallery_post',
  'event',
  'project',
]);

export const reportStateEnum = pgEnum('report_state', [
  'open',
  'triaged',
  'investigating',
  'resolved',
  'dismissed',
  'appealed',
]);

export const reportReasonEnum = pgEnum('report_reason', [
  'harassment',
  'hate_or_discrimination',
  'sexual_content',
  'minor_safety',
  'grooming',
  'threat_or_violence',
  'self_harm',
  'privacy_violation',
  'impersonation',
  'spam',
  'malicious_upload',
  'copyright',
  'illegal_content',
  'scam',
  'other',
]);

export const moderationActionEnum = pgEnum('moderation_action', [
  'warn_user',
  'hide_content',
  'remove_content',
  'restore_content',
  'restrict_posting',
  'restrict_messaging',
  'restrict_connections',
  'freeze_account',
  'suspend_account',
  'ban_account',
  'reinstate_account',
  'revoke_device',
  'approve_device_transfer',
  'reset_credentials',
  'reject_game',
  'approve_game',
  'quarantine_file',
  'delete_file',
  'dismiss_report',
  'grant_role',
  'revoke_role',
  'note',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'message',
  'reply',
  'mention',
  'reaction',
  'repost',
  'connection_request',
  'connection_match',
  'project_invite',
  'event_invite',
  'event_reminder',
  'file_interaction',
  'game_published',
  'moderation',
  'level_change',
  'inner_arch_invite',
  'achievement',
  'system',
]);

export const collectionKindEnum = pgEnum('collection_kind', ['curated', 'member', 'event']);

export const cineStatusEnum = pgEnum('cine_status', ['announced', 'released', 'unknown']);

export const watchEventStatusEnum = pgEnum('watch_event_status', [
  'scheduled',
  'live',
  'finished',
  'cancelled',
]);

// ════════════════════════════════════════════════════════════════════════════
// Identity · Accounts · Devices
// ════════════════════════════════════════════════════════════════════════════

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Sequential membership number, e.g. ARCH-004821.
     * Allocated at insert time from the `member_id_seq` sequence owned by
     * db/bootstrap.ts, which keeps the migrator out of the business of
     * managing sequence ownership.
     */
    memberId: integer('member_id').notNull(),
    username: varchar('username', { length: 32 }).notNull(),
    displayName: varchar('display_name', { length: 64 }).notNull(),

    // ── Credentials (never serialised to clients) ──────────────────────────
    passwordHash: text('password_hash'),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }),

    // ── Private / non-public PII ───────────────────────────────────────────
    email: varchar('email', { length: 254 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    phone: varchar('phone', { length: 32 }),
    legalName: varchar('legal_name', { length: 128 }),

    // ── Age safety ─────────────────────────────────────────────────────────
    /** Coarse band only. Exact birthdate is intentionally not collected. */
    ageBand: varchar('age_band', { length: 16 }).notNull(),
    ageVerifiedAt: timestamp('age_verified_at', { withTimezone: true }),
    isMinor: boolean('is_minor').notNull().default(false),

    // ── Optional coarse region, never coordinates ──────────────────────────
    region: varchar('region', { length: 64 }),

    // ── Lifecycle ──────────────────────────────────────────────────────────
    status: accountStatusEnum('status').notNull().default('pending_verification'),
    level: memberLevelEnum('level').notNull().default('visitor'),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspensionReason: text('suspension_reason'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_key').on(t.username),
    uniqueIndex('users_member_id_key').on(t.memberId),
    index('users_status_idx').on(t.status),
    index('users_level_idx').on(t.level),
    index('users_created_idx').on(t.createdAt),
    index('users_email_idx').on(t.email),
  ],
);

/** Server-side settings. Never exposed publicly. */
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileVisibility: visibilityEnum('profile_visibility').notNull().default('members'),
  showActivity: boolean('show_activity').notNull().default(true),
  showCreations: boolean('show_creations').notNull().default(true),
  showArchiveContributions: boolean('show_archive_contributions').notNull().default(true),
  discoverable: boolean('discoverable').notNull().default(true),
  showRegion: boolean('show_region').notNull().default(false),
  searchableByEmail: boolean('searchable_by_email').notNull().default(false),
  messagePolicy: varchar('message_policy', { length: 16 }).notNull().default('members'),
  /** Connections master switch — dating always requires this AND per-mode opt-in. */
  connectionsEnabled: boolean('connections_enabled').notNull().default(false),
  datingEnabled: boolean('dating_enabled').notNull().default(false),
  allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
  hideAgeBand: boolean('hide_age_band').notNull().default(false),
  reduceMotion: boolean('reduce_motion').notNull().default(false),
  theme: varchar('theme', { length: 16 }).notNull().default('dark'),
  notifyOnMessage: boolean('notify_on_message').notNull().default(true),
  notifyOnReply: boolean('notify_on_reply').notNull().default(true),
  notifyOnMention: boolean('notify_on_mention').notNull().default(true),
  notifyOnReaction: boolean('notify_on_reaction').notNull().default(false),
  notifyOnConnection: boolean('notify_on_connection').notNull().default(true),
  notifyOnProject: boolean('notify_on_project').notNull().default(true),
  notifyOnEvent: boolean('notify_on_event').notNull().default(true),
  notifyOnFile: boolean('notify_on_file').notNull().default(false),
  notifyOnModeration: boolean('notify_on_moderation').notNull().default(true),
  notifyEmailDigest: boolean('notify_email_digest').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bumped whenever the derived profile feed cache must be rebuilt. */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    headline: varchar('headline', { length: 120 }),
    bio: text('bio'),
    avatarObjectId: uuid('avatar_object_id'),
    bannerObjectId: uuid('banner_object_id'),
    pronouns: varchar('pronouns', { length: 24 }),
    institution: varchar('institution', { length: 120 }),
    fieldOfStudy: varchar('field_of_study', { length: 120 }),
    /** JSON array of {key,label,group} */
    skills: jsonb('skills').$type<Array<{ key: string; label: string }>>().notNull().default([]),
    links: jsonb('links')
      .$type<Array<{ label: string; url: string }>>()
      .notNull()
      .default([]),
    profileVisibility: visibilityEnum('profile_visibility').notNull().default('members'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('profiles_headline_idx').on(t.headline)],
);

export const interests = pgTable(
  'interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 48 }).notNull(),
    label: varchar('label', { length: 64 }).notNull(),
    group: varchar('group', { length: 32 }).notNull(),
    emoji: varchar('emoji', { length: 8 }),
  },
  (t) => [
    uniqueIndex('interests_key_key').on(t.key),
    index('interests_group_idx').on(t.group),
  ],
);

export const userInterests = pgTable(
  'user_interests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interestId: uuid('interest_id')
      .notNull()
      .references(() => interests.id, { onDelete: 'cascade' }),
    /** 'core' interests feed discovery; 'casual' are shown but not matched on */
    strength: varchar('strength', { length: 8 }).notNull().default('core'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.interestId] }),
    index('user_interests_interest_idx').on(t.interestId),
    index('user_interests_user_idx').on(t.userId),
  ],
);

// ── Devices · one account ↔ one device ─────────────────────────────────────

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Stable, non-reversible installation fingerprint (HMAC of UA+screen+lang) */
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    label: varchar('label', { length: 96 }).notNull().default('This device'),
    platform: varchar('platform', { length: 48 }),
    status: deviceStatusEnum('status').notNull().default('active'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('devices_fingerprint_key').on(t.fingerprint),
    index('devices_user_idx').on(t.userId),
    index('devices_status_idx').on(t.status),
  ],
);

export const deviceCredentials = pgTable(
  'device_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array().notNull().default([]),
    type: credentialTypeEnum('type').notNull().default('webauthn'),
    backedUp: boolean('backed_up').notNull().default(false),
    status: deviceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('device_credentials_cred_key').on(t.credentialId),
    // Enforce one live authenticator per account at the database boundary.
    uniqueIndex('device_credentials_active_user_key').on(t.userId).where(sql`${t.revokedAt} is null`),
    index('device_credentials_user_idx').on(t.userId),
    index('device_credentials_device_idx').on(t.deviceId),
  ],
);

export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challenge: text('challenge').notNull(),
    /** 'register' | 'authenticate' */
    purpose: varchar('purpose', { length: 16 }).notNull(),
    deviceFingerprint: varchar('device_fingerprint', { length: 64 }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webauthn_challenge_key').on(t.challenge),
    index('webauthn_challenge_expiry_idx').on(t.expiresAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** sha256 of the opaque cookie value — the raw token is never stored */
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    csrfSecret: text('csrf_secret').notNull(),
    ipHash: varchar('ip_hash', { length: 64 }),
    userAgent: text('user_agent'),
    /** Bind session to this exact device fingerprint */
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 64 }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
    index('sessions_device_idx').on(t.deviceId),
  ],
);

export const deviceTransferRequests = pgTable(
  'device_transfer_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 32 }).notNull(),
    explanation: text('explanation').notNull(),
    fromDeviceId: uuid('from_device_id').references(() => devices.id, { onDelete: 'set null' }),
    newDeviceLabel: varchar('new_device_label', { length: 96 }),
    state: varchar('state', { length: 16 }).notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('device_transfer_state_idx').on(t.state),
    index('device_transfer_user_idx').on(t.userId),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// Roles · Permissions · Administration
// ════════════════════════════════════════════════════════════════════════════

export const adminRoles = pgTable('admin_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: adminRoleEnum('role').notNull(),
  label: varchar('label', { length: 64 }).notNull(),
  description: text('description').notNull(),
  /** Least-privilege capability set */
  permissions: text('permissions').array().notNull().default([]),
  rank: integer('rank').notNull().default(0),
});

export const adminAssignments = pgTable(
  'admin_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adminRoleId: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('admin_assign_user_role_key').on(t.userId, t.adminRoleId),
    index('admin_assign_role_idx').on(t.adminRoleId),
  ],
);

/** Immutable, append-only. Every sensitive administrative action lands here. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorLabel: varchar('actor_label', { length: 64 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: varchar('target_id', { length: 64 }),
    targetLabel: varchar('target_label', { length: 96 }),
    reason: text('reason'),
    /** Redacted, structured detail. Never contains raw secrets or plaintext PII. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipHash: varchar('ip_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorUserId),
    index('audit_action_idx').on(t.action),
    index('audit_created_idx').on(t.createdAt),
    index('audit_target_idx').on(t.targetType, t.targetId),
  ],
);

/** Rate-limit buckets. Fixed-window counters kept in Postgres. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: varchar('key', { length: 160 }).primaryKey(),
    count: integer('count').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_limits_expiry_idx').on(t.expiresAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// Storage · Archive Objects
// ════════════════════════════════════════════════════════════════════════════

export const storageObjects = pgTable(
  'storage_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driver: storageDriverEnum('driver').notNull().default('local'),
    /** Opaque key, e.g. ab/cd/<uuid>.webp. Never derived from user input. */
    objectKey: text('object_key').notNull(),
    /** Public URL prefix that serves this object through an authorised route */
    urlPrefix: text('url_prefix').notNull(),
    purpose: varchar('purpose', { length: 24 }).notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    contentType: text('content_type').notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('storage_objects_key_key').on(t.objectKey),
    index('storage_purpose_idx').on(t.purpose),
  ],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalName: varchar('original_name', { length: 200 }).notNull(),
    /** Sanitised display name; filesystem name is always a UUID */
    displayName: varchar('display_name', { length: 200 }).notNull(),
    /** sha256 of the original bytes — powers dedupe and integrity checks */
    checksum: varchar('checksum', { length: 64 }).notNull(),
    extension: varchar('extension', { length: 16 }).notNull().default(''),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    declaredMime: text('declared_mime').notNull(),
    /** MIME determined by magic-byte inspection — the only trusted value */
    detectedMime: text('detected_mime'),
    charset: varchar('charset', { length: 32 }),
    state: fileStateEnum('state').notNull().default('quarantined'),
    scanProvider: varchar('scan_provider', { length: 32 }),
    scanSignature: varchar('scan_signature', { length: 64 }),
    scanDetail: text('scan_detail'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    storageObjectId: uuid('storage_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    thumbnailObjectId: uuid('thumbnail_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    previewObjectId: uuid('preview_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    pageCount: integer('page_count'),
    downloadCount: integer('download_count').notNull().default(0),
    isPublic: boolean('is_public').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('files_uploader_idx').on(t.uploaderId),
    index('files_state_idx').on(t.state),
    index('files_created_idx').on(t.createdAt),
    index('files_checksum_idx').on(t.checksum),
  ],
);

export const archiveObjects = pgTable(
  'archive_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-curated catalogue number, e.g. ARC-000317. Gaps are intentional. */
    catalogueNumber: integer('catalogue_number').notNull(),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description').notNull().default(''),
    category: archiveCategoryEnum('category').notNull(),
    contributorId: uuid('contributor_id').references(() => users.id, { onDelete: 'set null' }),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    previewObjectId: uuid('preview_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    license: varchar('license', { length: 64 }).notNull().default('Member shared — rights reserved'),
    attribution: varchar('attribution', { length: 160 }),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    downloadCount: integer('download_count').notNull().default(0),
    reactionCount: integer('reaction_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    /** Staff-curated flag surfaces in The Archive's featured rail */
    featured: boolean('featured').notNull().default(false),
    featuredNote: text('featured_note'),
    curatedBy: uuid('curated_by').references(() => users.id, { onDelete: 'set null' }),
    curatedAt: timestamp('curated_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('archive_objects_catalogue_key').on(t.catalogueNumber),
    uniqueIndex('archive_objects_slug_key').on(t.slug),
    index('archive_category_idx').on(t.category),
    index('archive_contributor_idx').on(t.contributorId),
    index('archive_created_idx').on(t.createdAt),
    index('archive_featured_idx').on(t.featured),
    index('archive_visibility_idx').on(t.visibility),
  ],
);

export const archiveObjectTags = pgTable(
  'archive_object_tags',
  {
    objectId: uuid('object_id')
      .notNull()
      .references(() => archiveObjects.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 32 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.tag] }),
    index('archive_tags_tag_idx').on(t.tag),
  ],
);

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: collectionKindEnum('kind').notNull().default('curated'),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    blurb: text('blurb').notNull().default(''),
    coverObjectId: uuid('cover_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    curatorId: uuid('curator_id').references(() => users.id, { onDelete: 'set null' }),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    itemCount: integer('item_count').notNull().default(0),
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collections_slug_key').on(t.slug),
    index('collections_kind_idx').on(t.kind),
    index('collections_featured_idx').on(t.featured),
  ],
);

export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    archiveObjectId: uuid('archive_object_id')
      .notNull()
      .references(() => archiveObjects.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    note: text('note'),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.archiveObjectId] }),
    index('collection_items_object_idx').on(t.archiveObjectId),
    index('collection_items_pos_idx').on(t.collectionId, t.position),
  ],
);

export const archiveComments = pgTable(
  'archive_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => archiveObjects.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: commentStatusEnum('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('archive_comments_object_idx').on(t.objectId, t.createdAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// The Commons
// ════════════════════════════════════════════════════════════════════════════

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** null body + poll = poll-only post */
    body: text('body'),
    status: postStatusEnum('status').notNull().default('published'),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    /** Optional link preview target; validated scheme only */
    linkUrl: text('link_url'),
    linkTitle: varchar('link_title', { length: 240 }),
    repostOfId: uuid('repost_of_id'),
    pinned: boolean('pinned').notNull().default(false),
    reactionCount: integer('reaction_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    repostCount: integer('repost_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('posts_author_idx').on(t.authorId, t.createdAt),
    index('posts_feed_idx').on(t.status, t.lastActivityAt),
    index('posts_created_idx').on(t.createdAt),
    index('posts_repost_idx').on(t.repostOfId),
  ],
);

export const postAttachments = pgTable(
  'post_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('post_attachments_post_idx').on(t.postId, t.position),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    status: commentStatusEnum('status').notNull().default('published'),
    reactionCount: integer('reaction_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('comments_post_idx').on(t.postId, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
    index('comments_author_idx').on(t.authorId),
  ],
);

/** Unified reaction ledger for posts, comments, archive objects, games, gallery. */
export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 24 }).notNull(),
    targetId: uuid('target_id').notNull(),
    /** Stored as a small integer mapped to a curated glyph set */
    kind: varchar('kind', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reactions_unique_key').on(t.userId, t.targetType, t.targetId, t.kind),
    index('reactions_target_idx').on(t.targetType, t.targetId),
    index('reactions_user_idx').on(t.userId),
  ],
);

export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  question: varchar('question', { length: 240 }).notNull(),
  multiSelect: boolean('multi_select').notNull().default(false),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 120 }).notNull(),
    position: integer('position').notNull().default(0),
    votes: integer('votes').notNull().default(0),
  },
  (t) => [index('poll_options_poll_idx').on(t.pollId, t.position)],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pollId, t.userId] }),
    index('poll_votes_option_idx').on(t.optionId),
  ],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 24 }).notNull(),
    targetId: uuid('target_id').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index('bookmarks_user_idx').on(t.userId, t.createdAt),
  ],
);

export const hashtags = pgTable(
  'hashtags',
  {
    tag: varchar('tag', { length: 48 }).primaryKey(),
    useCount: integer('use_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hashtags_count_idx').on(t.useCount)],
);

export const postHashtags = pgTable(
  'post_hashtags',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 48 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tag] }),
    index('post_hashtags_tag_idx').on(t.tag),
  ],
);

export const postMentions = pgTable(
  'post_mentions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.mentionedUserId] }),
    index('post_mentions_user_idx').on(t.mentionedUserId),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// Conversations · Messages · Projects
// ════════════════════════════════════════════════════════════════════════════

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: conversationKindEnum('kind').notNull(),
    title: varchar('title', { length: 120 }),
    topic: text('topic'),
    projectId: uuid('project_id'),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Small private groups only — enforced at the action layer (max 12) */
    maxMembers: integer('max_members').notNull().default(12),
    avatarObjectId: uuid('avatar_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: varchar('last_message_preview', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('conversations_last_msg_idx').on(t.lastMessageAt),
    index('conversations_project_idx').on(t.projectId),
  ],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('conversation_members_user_idx').on(t.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    replyToId: uuid('reply_to_id'),
    attachmentFileId: uuid('attachment_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    /** Set once; powers unread badges */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_sender_idx').on(t.senderId),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    summary: text('summary').notNull().default(''),
    description: text('description').notNull().default(''),
    /** 'temporary' rooms expire; 'permanent' persist */
    lifespan: varchar('lifespan', { length: 16 }).notNull().default('permanent'),
    coverObjectId: uuid('cover_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    taskCount: integer('task_count').notNull().default(0),
    openTasks: integer('open_tasks').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('projects_slug_key').on(t.slug),
    index('projects_owner_idx').on(t.ownerId),
    index('projects_status_idx').on(t.status, t.createdAt),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull().default('contributor'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_members_user_idx').on(t.userId),
  ],
);

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    detail: text('detail').notNull().default(''),
    status: varchar('status', { length: 16 }).notNull().default('todo'),
    position: integer('position').notNull().default(0),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('project_tasks_project_idx').on(t.projectId, t.status, t.position),
    index('project_tasks_assignee_idx').on(t.assigneeId),
  ],
);

export const projectResources = pgTable(
  'project_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    caption: varchar('caption', { length: 160 }).notNull().default(''),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('project_resources_project_idx').on(t.projectId, t.createdAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// The Arcade
// ════════════════════════════════════════════════════════════════════════════

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 140 }).notNull(),
    tagline: varchar('tagline', { length: 200 }).notNull().default(''),
    description: text('description').notNull().default(''),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    genre: varchar('genre', { length: 40 }).notNull().default('other'),
    controls: text('controls').notNull().default(''),
    status: gameStatusEnum('status').notNull().default('submitted'),
    /** Sandbox package: index.html + whitelisted assets, served from game origin */
    entryFile: text('entry_file').notNull().default('index.html'),
    packageObjectId: uuid('package_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    thumbnailObjectId: uuid('thumbnail_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    /** SHA-256 of the exact package served, pinned into the CSP allowlist */
    packageChecksum: varchar('package_checksum', { length: 64 }),
    /** Sanitiser findings, shown to reviewers and to the player */
    scanReport: jsonb('scan_report')
      .$type<{ findings: Array<{ rule: string; detail: string; severity: string }>; blocked: boolean }>()
      .notNull()
      .default({ findings: [], blocked: false }),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    playCount: integer('play_count').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    reactionCount: integer('reaction_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('games_slug_key').on(t.slug),
    index('games_status_idx').on(t.status, t.playCount),
    index('games_creator_idx').on(t.creatorId),
    index('games_genre_idx').on(t.genre),
  ],
);

export const gameTags = pgTable(
  'game_tags',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 32 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.tag] }),
    index('game_tags_tag_idx').on(t.tag),
  ],
);

export const gameRatings = pgTable(
  'game_ratings',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 1–5 */
    stars: integer('stars').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.userId] }),
    index('game_ratings_game_idx').on(t.gameId),
  ],
);

export const gameComments = pgTable(
  'game_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    parentId: uuid('parent_id'),
    status: commentStatusEnum('status').notNull().default('published'),
    reactionCount: integer('reaction_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('game_comments_game_idx').on(t.gameId, t.createdAt)],
);

export const gamePlays = pgTable(
  'game_plays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Seconds actually spent in the sandbox */
    seconds: integer('seconds').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('game_plays_game_idx').on(t.gameId),
    index('game_plays_user_idx').on(t.userId, t.createdAt),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// The Gallery
// ════════════════════════════════════════════════════════════════════════════

export const galleryPosts = pgTable(
  'gallery_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 160 }).notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: galleryKindEnum('kind').notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    caption: text('caption').notNull().default(''),
    /** Writing renders here; media posts use attachments */
    body: text('body'),
    coverObjectId: uuid('cover_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    /** Curated portfolios shown on the creator's profile */
    showInPortfolio: boolean('show_in_portfolio').notNull().default(true),
    reactionCount: integer('reaction_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    status: postStatusEnum('status').notNull().default('published'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('gallery_slug_key').on(t.slug),
    index('gallery_author_idx').on(t.authorId, t.createdAt),
    index('gallery_kind_idx').on(t.kind, t.createdAt),
    index('gallery_status_idx').on(t.status, t.createdAt),
  ],
);

export const galleryAttachments = pgTable(
  'gallery_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => galleryPosts.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    caption: varchar('caption', { length: 200 }),
  },
  (t) => [index('gallery_attachments_post_idx').on(t.postId, t.position)],
);

export const galleryComments = pgTable(
  'gallery_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => galleryPosts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: commentStatusEnum('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('gallery_comments_post_idx').on(t.postId, t.createdAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// Connections
// ════════════════════════════════════════════════════════════════════════════

export const connectionPreferences = pgTable(
  'connection_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 16 = 18+ ; 14 = 14–15 ; 13 = 13 ; 16plus etc. Lower bound gating */
    minAgeBand: varchar('min_age_band', { length: 16 }).notNull().default('13'),
    maxAgeBand: varchar('max_age_band', { length: 16 }).notNull().default('18+'),
    datingOptIn: boolean('dating_opt_in').notNull().default(false),
    friendshipOptIn: boolean('friendship_opt_in').notNull().default(false),
    collaborationOptIn: boolean('collaboration_opt_in').notNull().default(false),
    /** Age-gap guard: dating matches never exceed this many bands of distance */
    maxDatingAgeGapBands: integer('max_dating_age_gap_bands').notNull().default(2),
    datingIntent: varchar('dating_intent', { length: 48 }),
    showInDating: boolean('show_in_dating').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conn_prefs_dating_idx').on(t.datingOptIn, t.showInDating)],
);

export const connectionInterests = pgTable(
  'connection_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: connectionModeEnum('mode').notNull(),
    label: varchar('label', { length: 64 }).notNull(),
    /** Higher weight sorts earlier in matching */
    weight: integer('weight').notNull().default(1),
  },
  (t) => [index('connection_interests_mode_idx').on(t.mode)],
);

export const userConnectionInterests = pgTable(
  'user_connection_interests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interestId: uuid('interest_id')
      .notNull()
      .references(() => connectionInterests.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.interestId] }),
    index('user_conn_interests_interest_idx').on(t.interestId),
  ],
);

export const connectionRequests = pgTable(
  'connection_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: connectionModeEnum('mode').notNull(),
    note: text('note').notNull().default(''),
    state: varchar('state', { length: 16 }).notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conn_req_to_idx').on(t.toUserId, t.state),
    index('conn_req_from_idx').on(t.fromUserId, t.createdAt),
    index('conn_req_pair_idx').on(t.fromUserId, t.toUserId),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: connectionModeEnum('mode').notNull(),
    requestId: uuid('request_id').references(() => connectionRequests.id, {
      onDelete: 'set null',
    }),
    status: matchStatusEnum('status').notNull().default('pending'),
    /** Denormalised for fast feed reads; never exposes exact dates */
    ageBandAtMatch: varchar('age_band_at_match', { length: 16 }),
    sharedInterestCount: integer('shared_interest_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Canonical pair ordering is enforced in the action layer (least uuid first),
     * so a plain composite unique index is sufficient and stays portable.
     */
    uniqueIndex('matches_pair_mode_key').on(t.userAId, t.userBId, t.mode),
    index('matches_user_a_idx').on(t.userAId, t.status),
    index('matches_user_b_idx').on(t.userBId, t.status),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 16 }).notNull().default('all'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blocks_pair_key').on(t.blockerId, t.blockedId),
    index('blocks_blocked_idx').on(t.blockedId),
  ],
);

export const connectionSafetyFlags = pgTable(
  'connection_safety_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 32 }).notNull(),
    detail: text('detail').notNull(),
    severity: varchar('severity', { length: 12 }).notNull().default('low'),
    source: varchar('source', { length: 24 }).notNull().default('system'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('safety_flags_user_idx').on(t.userId),
    index('safety_flags_severity_idx').on(t.severity),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// Events
// ════════════════════════════════════════════════════════════════════════════

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description').notNull().default(''),
    kind: eventKindEnum('kind').notNull().default('community'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Optional legitimate streaming / call link supplied by the host */
    location: varchar('location', { length: 200 }),
    capacity: integer('capacity'),
    coverObjectId: uuid('cover_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'set null' }),
    movieId: uuid('movie_id'),
    visibility: visibilityEnum('visibility').notNull().default('members'),
    attendingCount: integer('attending_count').notNull().default(0),
    interestedCount: integer('interested_count').notNull().default(0),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('events_slug_key').on(t.slug),
    index('events_starts_idx').on(t.startsAt),
    index('events_host_idx').on(t.hostId),
    index('events_kind_idx').on(t.kind),
  ],
);

export const rsvps = pgTable(
  'rsvps',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: rsvpEnum('status').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('rsvps_user_idx').on(t.userId),
  ],
);

export const eventComments = pgTable(
  'event_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: commentStatusEnum('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('event_comments_event_idx').on(t.eventId, t.createdAt)],
);

export const eventFiles = pgTable(
  'event_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 160 }).notNull().default(''),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_files_event_idx').on(t.eventId, t.createdAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// The Cinema
// ════════════════════════════════════════════════════════════════════════════

export const films = pgTable(
  'films',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    year: integer('year'),
    director: varchar('director', { length: 120 }),
    /** Only legitimate, official availability links are stored here */
    watchLinks: jsonb('watch_links')
      .$type<Array<{ service: string; url: string; note?: string }>>()
      .notNull()
      .default([]),
    synopsis: text('synopsis').notNull().default(''),
    coverObjectId: uuid('cover_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    cineStatus: cineStatusEnum('cine_status').notNull().default('unknown'),
    runtimeMinutes: integer('runtime_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('films_slug_key').on(t.slug), index('films_year_idx').on(t.year)],
);

export const filmReviews = pgTable(
  'film_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filmId: uuid('film_id')
      .notNull()
      .references(() => films.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 0–10, half-star friendly */
    rating: real('rating').notNull(),
    body: text('body').notNull().default(''),
    spoilers: boolean('spoilers').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('film_reviews_unique_key').on(t.filmId, t.authorId),
    index('film_reviews_film_idx').on(t.filmId),
  ],
);

export const filmComments = pgTable(
  'film_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filmId: uuid('film_id')
      .notNull()
      .references(() => films.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Scene-level discussion; optional label like "Act II — the bridge" */
    sceneLabel: varchar('scene_label', { length: 120 }),
    spoilers: boolean('spoilers').notNull().default(false),
    status: commentStatusEnum('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('film_comments_film_idx').on(t.filmId, t.createdAt)],
);

export const watchlists = pgTable(
  'watchlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull().default('My Watchlist'),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('watchlists_user_idx').on(t.userId)],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    watchlistId: uuid('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    filmId: uuid('film_id')
      .notNull()
      .references(() => films.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    watched: boolean('watched').notNull().default(false),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.watchlistId, t.filmId] }),
    index('watchlist_items_film_idx').on(t.filmId),
  ],
);

export const watchEvents = pgTable(
  'watch_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    filmId: uuid('film_id')
      .notNull()
      .references(() => films.id, { onDelete: 'cascade' }),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** Host-supplied link to a legitimate service's watch party room */
    roomUrl: text('room_url'),
    roomProvider: varchar('room_provider', { length: 48 }),
    status: watchEventStatusEnum('status').notNull().default('scheduled'),
    attendeeCount: integer('attendendee_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('watch_events_slug_key').on(t.slug),
    index('watch_events_starts_idx').on(t.startsAt),
    index('watch_events_film_idx').on(t.filmId),
  ],
);

export const watchEventAttendees = pgTable(
  'watch_event_attendees',
  {
    watchEventId: uuid('watch_event_id')
      .notNull()
      .references(() => watchEvents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.watchEventId, t.userId] })],
);

// ════════════════════════════════════════════════════════════════════════════
// Society · The Inner Arch · The Chronicle
// ════════════════════════════════════════════════════════════════════════════

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 32 }).notNull(),
    tier: varchar('tier', { length: 24 }).notNull().default('member'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    maxUses: integer('max_uses').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('invitations_code_key').on(t.code),
    index('invitations_tier_idx').on(t.tier),
  ],
);

export const invitationRedemptions = pgTable(
  'invitation_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invitation_redemptions_key').on(t.invitationId, t.userId)],
);

export const innerArchMembers = pgTable(
  'inner_arch_members',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    standing: varchar('standing', { length: 16 }).notNull().default('member'),
    focus: text('focus').notNull().default(''),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('inner_arch_standing_idx').on(t.standing)],
);

export const governanceProposals = pgTable(
  'governance_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 140 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    body: text('body').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    /** quorum for inner arch standing */
    quorum: integer('quorum').notNull().default(5),
    result: varchar('result', { length: 16 }).notNull().default('open'),
    upvoterCount: integer('upvoter_count').notNull().default(0),
    downvoterCount: integer('downvoter_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('governance_result_idx').on(t.result, t.closesAt)],
);

export const governanceVotes = pgTable(
  'governance_votes',
  {
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => governanceProposals.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.userId] })],
);

export const chronicleEntries = pgTable(
  'chronicle_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'public' entries are on The Chronicle; 'hidden' are discoveries */
    kind: varchar('kind', { length: 16 }).notNull().default('public'),
    era: varchar('era', { length: 32 }).notNull(),
    headline: varchar('headline', { length: 200 }).notNull(),
    body: text('body').notNull(),
    occurredOn: timestamp('occurred_on', { withTimezone: true }).notNull(),
    relatedEventId: uuid('related_event_id').references(() => events.id, { onDelete: 'set null' }),
    relatedObjectId: uuid('related_object_id').references(() => archiveObjects.id, {
      onDelete: 'set null',
    }),
    /** Hidden entries require a member to reach the right level or find the key */
    unlockLevel: varchar('unlock_level', { length: 16 }),
    unlockHint: varchar('unlock_hint', { length: 160 }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chronicle_kind_idx').on(t.kind, t.occurredOn),
    index('chronicle_era_idx').on(t.era),
  ],
);

export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 48 }).notNull(),
  label: varchar('label', { length: 96 }).notNull(),
  description: text('description').notNull(),
  glyph: varchar('glyph', { length: 8 }).notNull().default('◈'),
  /** 'hidden' achievements are silent and listed only in The Registry */
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

export const levelHistory = pgTable(
  'level_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromLevel: varchar('from_level', { length: 16 }).notNull(),
    toLevel: varchar('to_level', { length: 16 }).notNull(),
    basis: text('basis').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('level_history_user_idx'.concat('')).on(t.userId, t.createdAt)],
);

// ════════════════════════════════════════════════════════════════════════════
// Moderation · Reports · Notifications
// ════════════════════════════════════════════════════════════════════════════

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Reporters are never exposed to the reported party */
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTargetEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    targetOwnerId: uuid('target_owner_id').references(() => users.id, { onDelete: 'set null' }),
    reason: reportReasonEnum('reason').notNull(),
    detail: text('detail').notNull().default(''),
    state: reportStateEnum('state').notNull().default('open'),
    priority: varchar('priority', { length: 12 }).notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_state_idx').on(t.state, t.priority),
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_reporter_idx').on(t.reporterId),
    index('reports_owner_idx').on(t.targetOwnerId),
  ],
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorLabel: varchar('actor_label', { length: 64 }).notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: varchar('target_type', { length: 24 }),
    targetId: uuid('target_id'),
    action: moderationActionEnum('action').notNull(),
    reason: text('reason').notNull().default(''),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    /** Internal-only notes; never shown to the reported member */
    internalNote: text('internal_note'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mod_actions_target_idx').on(t.targetUserId, t.createdAt),
    index('mod_actions_actor_idx').on(t.actorId),
    index('mod_actions_report_idx').on(t.reportId),
  ],
);

export const userRestrictions = pgTable(
  'user_restrictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'post' | 'message' | 'connections' | 'upload' */
    capability: varchar('capability', { length: 16 }).notNull(),
    reason: text('reason').notNull().default(''),
    placedBy: uuid('placed_by').references(() => users.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_restrictions_user_idx'.concat('')).on(t.userId, t.capability)],
);

export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionId: uuid('action_id').references(() => moderationActions.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    state: varchar('state', { length: 16 }).notNull().default('open'),
    outcome: text('outcome'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('appeals_user_idx'.concat('')).on(t.userId, t.state)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    body: text('body').notNull().default(''),
    href: text('href'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: varchar('target_type', { length: 24 }),
    targetId: uuid('target_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx').on(t.userId, t.readAt),
  ],
);

/** Small durable queue drained by the SSE notifier. */
export const realtimeQueue = pgTable(
  'realtime_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 32 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [index('realtime_pending_idx'.concat('')).on(t.userId, t.deliveredAt)],
);

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    stepUpAt: timestamp('step_up_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_sessions_user_idx'.concat('')).on(t.userId, t.expiresAt)],
);

// Personal music library and playlists. Tracks reference clean Exchange uploads;
// playlists are private to their owner unless a future explicit sharing policy is added.
export const musicPlaylists = pgTable(
  'music_playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('music_playlists_user_idx').on(t.userId, t.updatedAt)],
);

export const musicPlaylistTracks = pgTable(
  'music_playlist_tracks',
  {
    playlistId: uuid('playlist_id').notNull().references(() => musicPlaylists.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.fileId] }),
    uniqueIndex('music_playlist_track_position_key').on(t.playlistId, t.position),
    index('music_playlist_tracks_file_idx').on(t.fileId),
  ],
);

export const musicLikedTracks = pgTable(
  'music_liked_tracks',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.fileId] }),
    index('music_liked_tracks_file_idx').on(t.fileId),
    index('music_liked_tracks_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export const userFollows = pgTable(
  'user_follows',
  {
    followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    followedId: uuid('followed_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followedId] }),
    index('user_follows_followed_idx').on(t.followedId, t.createdAt),
    index('user_follows_follower_idx').on(t.followerId, t.createdAt),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// Relations (only where they earn their keep)
// ════════════════════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
  devices: many(devices),
  posts: many(posts),
  interests: many(userInterests),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  comments: many(comments),
  attachments: many(postAttachments),
  repostOf: one(posts, { fields: [posts.repostOfId], references: [posts.id], relationName: 'repost' }),
  reposts: many(posts, { relationName: 'repost' }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id], relationName: 'thread' }),
  replies: many(comments, { relationName: 'thread' }),
}));

export const archiveObjectsRelations = relations(archiveObjects, ({ one, many }) => ({
  contributor: one(users, { fields: [archiveObjects.contributorId], references: [users.id] }),
  file: one(files, { fields: [archiveObjects.fileId], references: [files.id] }),
  tags: many(archiveObjectTags),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  members: many(conversationMembers),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  attachment: one(files, { fields: [messages.attachmentFileId], references: [files.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  uploader: one(users, { fields: [files.uploaderId], references: [users.id] }),
  storageObject: one(storageObjects, { fields: [files.storageObjectId], references: [storageObjects.id] }),
  thumbnail: one(storageObjects, { fields: [files.thumbnailObjectId], references: [storageObjects.id] }),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  creator: one(users, { fields: [games.creatorId], references: [users.id] }),
  tags: many(gameTags),
  ratings: many(gameRatings),
  comments: many(gameComments),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  members: many(projectMembers),
  tasks: many(projectTasks),
  resources: many(projectResources),
}));

export const galleryPostsRelations = relations(galleryPosts, ({ one, many }) => ({
  author: one(users, { fields: [galleryPosts.authorId], references: [users.id] }),
  attachments: many(galleryAttachments),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  host: one(users, { fields: [events.hostId], references: [users.id] }),
  rsvps: many(rsvps),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  userA: one(users, { fields: [matches.userAId], references: [users.id] }),
  userB: one(users, { fields: [matches.userBId], references: [users.id] }),
}));