/**
 * Enyd Arch · domain vocabulary
 *
 * These are the rules of the society, expressed once. Every layer — UI copy,
 * validation, matching, moderation — reads from here so that a change to, say,
 * the age ladder cannot drift between the interface and the safety engine.
 */

// ═══════════════════════════════════════════════════════════════════════════
// The mark
// ═══════════════════════════════════════════════════════════════════════════

export const MARK = '◈';
export const MARK_OPEN = '◇';

export const TAGLINE = 'Enter quietly. Discover freely.';

export const PRODUCT_NAME = 'Enyd Arch';

// ═══════════════════════════════════════════════════════════════════════════
// Member identity
// ═══════════════════════════════════════════════════════════════════════════

/** ARCH-004821 */
export const MEMBER_ID_PREFIX = 'ARCH-';
export const MEMBER_ID_DIGITS = 6;

export function formatMemberId(memberId: number): string {
  return `${MEMBER_ID_PREFIX}${String(memberId).padStart(MEMBER_ID_DIGITS, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Age bands
//
// Enyd Arch never collects an exact date of birth. Members declare a band,
// which is the only age signal the matching engine ever sees. Bands are
// ordered by `floorAge`, which is the youngest age someone in the band could be.
// ═══════════════════════════════════════════════════════════════════════════

export interface AgeBand {
  key: string;
  label: string;
  /** Youngest possible age in the band */
  floorAge: number;
  /** Oldest possible age in the band */
  ceilingAge: number;
  /** Conservative defaults applied to minors */
  minor: boolean;
  note: string;
}

export const AGE_BANDS: AgeBand[] = [
  { key: 'u13', label: 'Under 13', floorAge: 0, ceilingAge: 12, minor: true, note: 'A parent or guardian must agree before membership.' },
  { key: '13', label: '13', floorAge: 13, ceilingAge: 13, minor: true, note: 'Connections dating is unavailable.' },
  { key: '14', label: '14–15', floorAge: 14, ceilingAge: 15, minor: true, note: 'Connections dating is unavailable.' },
  { key: '16', label: '16–17', floorAge: 16, ceilingAge: 17, minor: true, note: 'Connections dating is unavailable.' },
  { key: '18', label: '18–19', floorAge: 18, ceilingAge: 19, minor: false, note: 'Adult band.' },
  { key: '20', label: '20–22', floorAge: 20, ceilingAge: 22, minor: false, note: 'Adult band.' },
  { key: '23', label: '23–25', floorAge: 23, ceilingAge: 25, minor: false, note: 'Adult band.' },
  { key: '26', label: '26+', floorAge: 26, ceilingAge: 120, minor: false, note: 'Adult band.' },
];

export const AGE_BAND_BY_KEY: Record<string, AgeBand> = Object.fromEntries(
  AGE_BANDS.map((band) => [band.key, band]),
);

export function ageBand(key: string): AgeBand {
  const band = AGE_BAND_BY_KEY[key];
  if (!band) throw new Error(`Unknown age band: ${key}`);
  return band;
}

export function ageBandLabel(key: string): string {
  return AGE_BAND_BY_KEY[key]?.label ?? 'Undisclosed';
}

export const MIN_AGE_BAND = '13';

/** The youngest band permitted to hold a full membership without guardian flow. */
export const SELF_AGE_BAND = '13';

// ═══════════════════════════════════════════════════════════════════════════
// Member levels
//
// Levels are granted for contribution, trust, curation and governance. They
// are deliberately not a score: nothing is awarded for raw posting volume, and
// there is no decay-by-inactivity mechanic.
// ═══════════════════════════════════════════════════════════════════════════

export type MemberLevel =
  | 'visitor'
  | 'member'
  | 'contributor'
  | 'creator'
  | 'archivist'
  | 'curator'
  | 'inner_arch';

export interface LevelDefinition {
  key: MemberLevel;
  label: string;
  rank: number;
  glyph: string;
  summary: string;
  /** What a member must demonstrate to be considered for this level. */
  basis: string;
}

export const MEMBER_LEVELS: Record<MemberLevel, LevelDefinition> = {
  visitor: {
    key: 'visitor',
    label: 'Visitor',
    rank: 0,
    glyph: '◇',
    summary: 'Has entered, has not yet been introduced.',
    basis: 'Account created.',
  },
  member: {
    key: 'member',
    label: 'Member',
    rank: 1,
    glyph: '◈',
    summary: 'A recognised member of the society.',
    basis: 'Completed onboarding, agreed to the charter.',
  },
  contributor: {
    key: 'contributor',
    label: 'Contributor',
    rank: 2,
    glyph: '◈',
    summary: 'Adds to the Commons and the Archive reliably.',
    basis: 'Sustained, well-received participation across conversations.',
  },
  creator: {
    key: 'creator',
    label: 'Creator',
    rank: 3,
    glyph: '◆',
    summary: 'Publishes work: games, writing, music, design, tools.',
    basis: 'Original work shared with the community and used by others.',
  },
  archivist: {
    key: 'archivist',
    label: 'Archivist',
    rank: 4,
    glyph: '❖',
    summary: 'Keeps the Archive legible, accurate and well-catalogued.',
    basis: 'Repeated, careful curation of Archive objects and collections.',
  },
  curator: {
    key: 'curator',
    label: 'Curator',
    rank: 5,
    glyph: '❖',
    summary: 'Shapes what the society sees and remembers.',
    basis: 'Staff trust in editorial judgement and community care.',
  },
  inner_arch: {
    key: 'inner_arch',
    label: 'Inner Arch',
    rank: 6,
    glyph: '✦',
    summary: 'Trusted stewards who help govern the society.',
    basis: 'Invitation from an existing steward, confirmed by Administration.',
  },
};

export const LEVEL_ORDER: MemberLevel[] = [
  'visitor',
  'member',
  'contributor',
  'creator',
  'archivist',
  'curator',
  'inner_arch',
];

export function levelLabel(level: string): string {
  return MEMBER_LEVELS[level as MemberLevel]?.label ?? 'Member';
}

export function levelGlyph(level: string): string {
  return MEMBER_LEVELS[level as MemberLevel]?.glyph ?? '◇';
}

export function levelRank(level: string): number {
  return MEMBER_LEVELS[level as MemberLevel]?.rank ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Administrative capabilities (least privilege)
// ═══════════════════════════════════════════════════════════════════════════

export const ADMIN_ROLES = [
  {
    role: 'community_moderator',
    label: 'Community Moderator',
    description: 'Handles everyday content moderation in the Commons, Gallery and Archive.',
    rank: 1,
    permissions: [
      'reports.read',
      'reports.resolve',
      'content.hide',
      'content.remove',
      'content.restore',
      'users.warn',
      'users.restrict_posting',
      'games.review',
      'files.review',
      'notes.write',
    ],
  },
  {
    role: 'safety_administrator',
    label: 'Safety Administrator',
    description: 'Owns age safety, Connections safety, serious reports and appeals.',
    rank: 2,
    permissions: [
      'reports.read',
      'reports.read_sensitive',
      'reports.resolve',
      'reports.resolve_serious',
      'content.hide',
      'content.remove',
      'users.warn',
      'users.restrict_messaging',
      'users.restrict_connections',
      'users.freeze',
      'users.suspend',
      'connections.review',
      'safety.resolve_flags',
      'appeals.review',
      'notes.write',
    ],
  },
  {
    role: 'system_administrator',
    label: 'System Administrator',
    description: 'Infrastructure, accounts, devices and platform configuration.',
    rank: 3,
    permissions: [
      'reports.read',
      'users.warn',
      'users.ban',
      'users.reinstate',
      'devices.read',
      'devices.revoke',
      'devices.approve_transfer',
      'credentials.reset',
      'roles.grant',
      'roles.revoke',
      'platform.settings',
      'system.health',
      'audit.read',
      'files.quarantine',
      'notes.write',
    ],
  },
  {
    role: 'owner',
    label: 'Owner',
    description: 'Full administrative authority over the installation.',
    rank: 4,
    permissions: ['*'],
  },
] as const;

export type AdminRoleKey = (typeof ADMIN_ROLES)[number]['role'];
export type AdminPermission = string;

export function roleHasPermission(role: string, permissions: string[], permission: string): boolean {
  if (permissions.includes('*')) return true;
  if (permission === '*') return permissions.includes('*');
  return permissions.includes(permission);
}

export const PERMISSION_LABELS: Record<string, string> = {
  'reports.read': 'View reports',
  'reports.read_sensitive': 'View reports containing member safety detail',
  'reports.resolve': 'Resolve reports',
  'reports.resolve_serious': 'Resolve serious safety reports',
  'content.hide': 'Hide content from the community',
  'content.remove': 'Remove content',
  'content.restore': 'Restore removed content',
  'users.warn': 'Issue warnings',
  'users.restrict_posting': 'Restrict posting',
  'users.restrict_messaging': 'Restrict messaging',
  'users.restrict_connections': 'Remove from Connections',
  'users.freeze': 'Freeze accounts',
  'users.suspend': 'Suspend accounts',
  'users.ban': 'Ban accounts',
  'users.reinstate': 'Reinstate accounts',
  'devices.read': 'View enrolled devices',
  'devices.revoke': 'Revoke device credentials',
  'devices.approve_transfer': 'Approve device transfers',
  'credentials.reset': 'Reset credentials',
  'roles.grant': 'Grant administrative roles',
  'roles.revoke': 'Revoke administrative roles',
  'platform.settings': 'Change platform settings',
  'system.health': 'View system health',
  'audit.read': 'Read the audit log',
  'files.review': 'Review uploaded files',
  'files.quarantine': 'Quarantine files',
  'games.review': 'Review Arcade submissions',
  'connections.review': 'Review Connections safety flags',
  'safety.resolve_flags': 'Resolve safety flags',
  'appeals.review': 'Review appeals',
  'notes.write': 'Write moderation notes',
};

// ═══════════════════════════════════════════════════════════════════════════
// Permissions used inside the application shell
// ═══════════════════════════════════════════════════════════════════════════

export const CAPABILITIES = [
  'post',
  'comment',
  'message',
  'upload',
  'submit_game',
  'create_project',
  'create_event',
  'create_event_cinema',
  'connections',
  'connections_dating',
  'connect_friendship',
  'connect_collaboration',
  'moderate',
  'administer',
  'inner_arch',
  'curate',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// Areas of the Arch
// ═══════════════════════════════════════════════════════════════════════════

export interface Area {
  href: string;
  label: string;
  glyph: string;
  blurb: string;
  /** True when the area belongs to the Society group in navigation */
  society?: boolean;
}

export const AREAS = {
  home: { href: '/home', label: 'Home', glyph: '◈', blurb: 'Your Arch' },
  commons: { href: '/commons', label: 'The Commons', glyph: '❝', blurb: 'Conversation' },
  exchange: { href: '/exchange', label: 'The Exchange', glyph: '⇄', blurb: 'Upload and share' },
  archive: { href: '/archive', label: 'The Archive', glyph: '▤', blurb: 'Everything interesting' },
  arcade: { href: '/arcade', label: 'The Arcade', glyph: '◱', blurb: 'Play what members build' },
  gallery: { href: '/gallery', label: 'The Gallery', glyph: '❖', blurb: 'Creative work' },
  network: { href: '/network', label: 'The Network', glyph: '◌', blurb: 'Find members' },
  connections: { href: '/connections', label: 'Connections', glyph: '◇', blurb: 'Friends, collaborators, maybe more' },
  messages: { href: '/messages', label: 'Messages', glyph: '✉', blurb: 'Conversations' },
  projects: { href: '/projects', label: 'Projects', glyph: '⌘', blurb: 'Rooms and tasks' },
  events: { href: '/events', label: 'Events', glyph: '✧', blurb: 'Gatherings' },
  cinema: { href: '/cinema', label: 'The Cinema', glyph: '◐', blurb: 'Films and watch nights' },
  chronicle: { href: '/chronicle', label: 'The Chronicle', glyph: '✦', blurb: 'Our history' },
  registry: { href: '/registry', label: 'The Registry', glyph: '❒', blurb: 'Levels and standing' },
  innerArch: { href: '/inner-arch', label: 'The Inner Arch', glyph: '✦', blurb: 'Stewards of the society' },
} as const satisfies Record<string, Area>;

// ═══════════════════════════════════════════════════════════════════════════
// Navigation structure
// ═══════════════════════════════════════════════════════════════════════════

export interface NavEntry {
  href: string;
  label: string;
  glyph: string;
  /** Capability required to see the entry */
  capability?: Capability;
  adminPermission?: string;
  badge?: 'unread';
}

export const NAV_PRIMARY: NavEntry[] = [
  { href: '/home', label: 'Home', glyph: '◈' },
  { href: '/commons', label: 'The Commons', glyph: '❝' },
  { href: '/messages', label: 'Messages', glyph: '✉', capability: 'message', badge: 'unread' },
  { href: '/notifications', label: 'Notifications', glyph: '◔', badge: 'unread' },
];

export const NAV_DISCOVER: NavEntry[] = [
  { href: '/archive', label: 'The Archive', glyph: '▤' },
  { href: '/arcade', label: 'The Arcade', glyph: '◱' },
  { href: '/gallery', label: 'The Gallery', glyph: '❖' },
  { href: '/network', label: 'The Network', glyph: '◌' },
  { href: '/events', label: 'Events', glyph: '✧' },
  { href: '/cinema', label: 'The Cinema', glyph: '◐' },
];

export const NAV_BUILD: NavEntry[] = [
  { href: '/exchange', label: 'The Exchange', glyph: '⇄', capability: 'upload' },
  { href: '/projects', label: 'Projects', glyph: '⌘' },
  { href: '/connections', label: 'Connections', glyph: '◇' },
];

export const NAV_SOCIETY: NavEntry[] = [
  { href: '/chronicle', label: 'The Chronicle', glyph: '✦' },
  { href: '/registry', label: 'The Registry', glyph: '❒' },
  { href: '/inner-arch', label: 'The Inner Arch', glyph: '✦', capability: 'inner_arch' },
  { href: '/admin', label: 'Administration', glyph: '⚿', adminPermission: 'reports.read' },
];

export const BOTTOM_NAV: NavEntry[] = [
  { href: '/home', label: 'Home', glyph: '◈' },
  { href: '/commons', label: 'Commons', glyph: '❝' },
  { href: '/archive', label: 'Archive', glyph: '▤' },
  { href: '/connections', label: 'Connections', glyph: '◇' },
  { href: '/me', label: 'Me', glyph: '◑' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Archive
// ═══════════════════════════════════════════════════════════════════════════

export const ARCHIVE_CATEGORIES = [
  { key: 'knowledge', label: 'Knowledge', glyph: '§', blurb: 'Notes, explainers, things learned the long way.' },
  { key: 'student_resources', label: 'Student Resources', glyph: '✎', blurb: 'Material that got someone through a term.' },
  { key: 'games', label: 'Games', glyph: '◱', blurb: 'Playable things, small and strange.' },
  { key: 'music', label: 'Music', glyph: '♪', blurb: 'Records, compositions, playlists.' },
  { key: 'art', label: 'Art', glyph: '❖', blurb: 'Images made on purpose.' },
  { key: 'photography', label: 'Photography', glyph: '◉', blurb: 'Light, kept.' },
  { key: 'videos', label: 'Videos', glyph: '▶', blurb: 'Moving image, edited and raw.' },
  { key: 'documents', label: 'Documents', glyph: '▤', blurb: 'Papers, PDFs, references.' },
  { key: 'interesting_things', label: 'Interesting Things', glyph: '✧', blurb: 'Found objects. No explanation offered.' },
  { key: 'web_discoveries', label: 'Web Discoveries', glyph: '◌', blurb: 'Places on the internet worth keeping.' },
  { key: 'member_creations', label: 'Member Creations', glyph: '◈', blurb: 'Made here, published here.' },
] as const;

export type ArchiveCategoryKey = (typeof ARCHIVE_CATEGORIES)[number]['key'];

export const ARCHIVE_CATEGORY_MAP: Record<string, { key: string; label: string; glyph: string; blurb: string }> =
  Object.fromEntries(ARCHIVE_CATEGORIES.map((category) => [category.key, category]));

export const ARCHIVE_CATEGORIES_FOR_FILTER = [
  { value: '', label: 'Everything' },
  ...ARCHIVE_CATEGORIES.map((category) => ({ value: category.key, label: category.label })),
];

// ═══════════════════════════════════════════════════════════════════════════
// Reactions — a small, curated set. No custom emoji, no reaction sprawl.
// ═══════════════════════════════════════════════════════════════════════════

export const REACTIONS = [
  { key: 'appreciate', glyph: '✦', label: 'Appreciate' },
  { key: 'considered', glyph: '❋', label: 'Considered' },
  { key: 'useful', glyph: '↑', label: 'Useful' },
  { key: 'delight', glyph: '☺', label: 'Delight' },
  { key: 'inspiring', glyph: '◈', label: 'Inspiring' },
  { key: 'curious', glyph: '?', label: 'Curious' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export const REACTION_GLYPH: Record<string, string> = Object.fromEntries(
  REACTIONS.map((reaction) => [reaction.key, reaction.glyph]),
);

export const REACTION_LABEL: Record<string, string> = Object.fromEntries(
  REACTIONS.map((reaction) => [reaction.key, reaction.label]),
);

// ═══════════════════════════════════════════════════════════════════════════
// Genres & kinds
// ═══════════════════════════════════════════════════════════════════════════

export const GAME_GENRES = [
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'arcade', label: 'Arcade' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'platformer', label: 'Platformer' },
  { value: 'experimental', label: 'Experimental' },
  { value: 'card', label: 'Card & Table' },
  { value: 'art', label: 'Art Piece' },
  { value: 'other', label: 'Other' },
] as const;

export const GALLERY_KINDS = [
  { value: 'photography', label: 'Photography' },
  { value: 'digital_art', label: 'Digital Art' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'writing', label: 'Writing' },
  { value: 'animation', label: 'Animation' },
  { value: 'video_edit', label: 'Video Edit' },
  { value: 'design', label: 'Design' },
  { value: 'music', label: 'Music' },
] as const;

export const EVENT_KINDS = [
  { value: 'community', label: 'Community' },
  { value: 'game_night', label: 'Game Night' },
  { value: 'movie_night', label: 'Movie Night' },
  { value: 'competition', label: 'Competition' },
  { value: 'creative_challenge', label: 'Creative Challenge' },
  { value: 'study_session', label: 'Study Session' },
  { value: 'game_jam', label: 'Game Jam' },
  { value: 'archive_event', label: 'Archive Event' },
] as const;

export const CONNECTION_MODES = [
  {
    value: 'friendship',
    label: 'Friendship',
    glyph: '◈',
    blurb: 'People to talk to who are not in any of your classes.',
  },
  {
    value: 'collaboration',
    label: 'Collaboration',
    glyph: '⌘',
    blurb: 'People to build something with.',
  },
  {
    value: 'dating',
    label: 'Dating',
    glyph: '◇',
    blurb: 'Age-appropriate romantic connections, opt-in only.',
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Interests offered during onboarding and discovery
// ═══════════════════════════════════════════════════════════════════════════

export const INTEREST_GROUPS = [
  { group: 'Ideas', items: ['philosophy', 'history', 'languages', 'mathematics', 'law', 'psychology', 'economics', 'politics', 'literature', 'science'] },
  { group: 'Making', items: ['writing', 'drawing', 'painting', 'photography', 'film-making', 'music-making', 'game-design', 'programming', 'electronics', 'model-building'] },
  { group: 'Play', items: ['tabletop', 'video-games', 'chess', 'board-games', 'sports', 'running', 'hiking', 'climbing'] },
  { group: 'Curiosity', items: ['archaeology', 'astronomy', 'biology', 'mathematics-puzzles', 'cryptography', 'maps', 'birds', 'meteorology', 'linguistics', 'archives'] },
  { group: 'Society', items: ['volunteering', 'debate', 'student-press', 'robotics', 'chorus', 'theatre', 'startups', 'photography-club'] },
] as const;

export const INTEREST_LABELS: Record<string, string> = Object.fromEntries(
  INTEREST_GROUPS.flatMap((group) => group.items.map((item) => [item, titleCase(item)])),
);

export function titleCase(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Connections interests
// ═══════════════════════════════════════════════════════════════════════════

export const CONNECTION_INTERESTS = [
  { mode: 'friendship', key: 'late_night_talks', label: 'Late-night conversations', weight: 3 },
  { mode: 'friendship', key: 'board_games', label: 'Board games', weight: 2 },
  { mode: 'friendship', key: 'movies', label: 'Films', weight: 2 },
  { mode: 'friendship', key: 'music', label: 'Music', weight: 2 },
  { mode: 'friendship', key: 'books', label: 'Books', weight: 2 },
  { mode: 'friendship', key: 'walking', label: 'Long walks', weight: 1 },
  { mode: 'friendship', key: 'food', label: 'Food', weight: 1 },
  { mode: 'friendship', key: 'gaming', label: 'Games', weight: 2 },
  { mode: 'collaboration', key: 'game_jam', label: 'Game jams', weight: 3 },
  { mode: 'collaboration', key: 'film_project', label: 'Film projects', weight: 3 },
  { mode: 'collaboration', key: 'music_project', label: 'Music projects', weight: 3 },
  { mode: 'collaboration', key: 'zine', label: 'Zines and print', weight: 2 },
  { mode: 'collaboration', key: 'hackathon', label: 'Hackathons', weight: 3 },
  { mode: 'collaboration', key: 'research', label: 'Research projects', weight: 2 },
  { mode: 'collaboration', key: 'podcast', label: 'Podcasts', weight: 2 },
  { mode: 'collaboration', key: 'illustration', label: 'Illustration', weight: 2 },
  { mode: 'collaboration', key: 'web', label: 'Web projects', weight: 2 },
  { mode: 'collaboration', key: 'theatre', label: 'Theatre', weight: 1 },
  { mode: 'dating', key: 'quiet_nights', label: 'Quiet evenings', weight: 3 },
  { mode: 'dating', key: 'reading_together', label: 'Reading together', weight: 3 },
  { mode: 'dating', key: 'film_lovers', label: 'Film lovers', weight: 2 },
  { mode: 'dating', key: 'music_lovers', label: 'Music lovers', weight: 2 },
  { mode: 'dating', key: 'long_walks', label: 'Long walks', weight: 3 },
  { mode: 'dating', key: 'cooking_together', label: 'Cooking together', weight: 2 },
  { mode: 'dating', key: 'museums', label: 'Museums and galleries', weight: 2 },
  { mode: 'dating', key: 'hiking', label: 'Hiking', weight: 1 },
  { mode: 'dating', key: 'board_game_nights', label: 'Board game nights', weight: 1 },
  { mode: 'dating', key: 'poetry', label: 'Poetry and reading', weight: 2 },
  { mode: 'dating', key: 'bad_movies', label: 'Terrible movies', weight: 1 },
  { mode: 'dating', key: 'stargazing', label: 'Stargazing', weight: 1 },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Safety
// ═══════════════════════════════════════════════════════════════════════════

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying', hint: 'Targeted abuse, intimidation, or pile-on.' },
  { value: 'hate_or_discrimination', label: 'Hate or discrimination', hint: 'Attacks on someone’s identity.' },
  { value: 'sexual_content', label: 'Sexual content', hint: 'Sexual or explicit material shared inappropriately.' },
  { value: 'minor_safety', label: 'Concern for a member’s safety', hint: 'A member may be at risk. Treated as urgent.' },
  { value: 'grooming', label: 'Grooming behaviour', hint: 'An adult building trust with a younger member. Treated as urgent.' },
  { value: 'threat_or_violence', label: 'Threats or violence', hint: 'Statements or plans of harm. Treated as urgent.' },
  { value: 'self_harm', label: 'Self-harm or suicide', hint: 'A member may be hurting themselves. Support is offered.' },
  { value: 'privacy_violation', label: 'Privacy violation', hint: 'Someone’s private information was shared without consent.' },
  { value: 'impersonation', label: 'Impersonation', hint: 'Pretending to be another person, including a member of staff.' },
  { value: 'spam', label: 'Spam or advertising', hint: 'Unsolicited promotion, repeated junk.' },
  { value: 'malicious_upload', label: 'Malicious upload', hint: 'A file that appears designed to harm others.' },
  { value: 'copyright', label: 'Copyright infringement', hint: 'Material shared without the right to share it.' },
  { value: 'illegal_content', label: 'Illegal content', hint: 'Content that appears to be unlawful. Treated as urgent.' },
  { value: 'scam', label: 'Scam or fraud', hint: 'Attempts to deceive members out of money or data.' },
  { value: 'other', label: 'Something else', hint: 'Describe what happened in your own words.' },
] as const;

export const URGENT_REPORT_REASONS = new Set([
  'minor_safety',
  'grooming',
  'threat_or_violence',
  'self_harm',
  'illegal_content',
  'sexual_content',
]);

export function reportLabel(value: string): string {
  return REPORT_REASONS.find((reason) => reason.value === value)?.label ?? 'Report';
}

// ═══════════════════════════════════════════════════════════════════════════
// Copy
// ═══════════════════════════════════════════════════════════════════════════

export const COPY = {
  landing: {
    eyebrow: 'Welcome to Enyd Arch',
    headline: 'A private digital society for students.',
    lines: [
      'Talk to people.',
      'Exchange things.',
      'Build things.',
      'Discover things.',
    ],
    whisper: 'There is more here than first appears.',
    cta: 'Enter the Arch',
  },
  archive: {
    headline: 'Everything interesting eventually finds its way here.',
    body: 'Knowledge. Creations. Games. Music. Documents. Discoveries.',
    cta: 'Explore the collection',
  },
  connections: {
    headline: 'Find people worth knowing.',
    body: 'Friends. Collaborators. Maybe something more.',
    cta: 'You decide who you want to meet.',
  },
  privacy: {
    headline: 'Private by design.',
    body: 'Enyd Arch collects only the information necessary to operate and protect the community. Your public identity is your Enyd identity — not your personal information.',
  },
  device: {
    headline: 'Your Enyd identity',
    body: 'Your Enyd identity is associated with one trusted device. This helps prevent account sharing and keeps membership personal. Device changes require Administration approval.',
  },
  deviceLocked: {
    headline: 'This device is already enrolled',
    body: 'This device is currently associated with another Enyd identity. If you believe this is an error, contact Administration.',
  },
} as const;