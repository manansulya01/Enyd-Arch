import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '~db';
import {
  achievements,
  innerArchMembers,
  invitations,
  levelHistory,
  users,
  userAchievements,
} from '~db/schema';
import { LEVEL_ORDER, MEMBER_LEVELS, type MemberLevel } from '~/lib/domain';

/**
 * The society layer
 *
 * Levels, the Inner Arch, invitations, and achievements. Everything here is
 * granted for contribution, trust, curation, or governance — never for volume,
 * and never automatically for posting often. There is deliberately no decay
 * mechanic: a level reflects standing, not a score that has to be topped up.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Levels
// ═══════════════════════════════════════════════════════════════════════════

export interface LevelBasisInput {
  postsPublished: number;
  commentsWritten: number;
  archiveContributions: number;
  collectionsCurated: number;
  gamesApproved: number;
  galleryPieces: number;
  eventsHosted: number;
  reportsResolvedAsModerator: number;
  /** Staff trust in editorial judgement, 0–3. Never derived from volume. */
  curatorEndorsements: number;
  innerArchInvited: boolean;
}

/**
 * Recommends a level from evidence.
 *
 * Returns the level the evidence supports and a plain-language reason. Callers
 * decide whether to apply it: automation suggests, humans grant. Nothing here
 * writes to the database on its own.
 */
export function recommendLevel(evidence: LevelBasisInput): {
  level: MemberLevel;
  reason: string;
  evidence: string[];
} {
  const reasons: string[] = [];
  let suggested: MemberLevel = 'member';

  // ── Contributor: reliable, well-received participation ──────────────
  if (evidence.postsPublished + evidence.commentsWritten >= 25) {
    suggested = 'contributor';
    reasons.push(
      `${evidence.postsPublished} posts and ${evidence.commentsWritten} replies shared with the Commons`,
    );
  }

  // ── Creator: original work others actually used ──────────────────────
  const creations =
    evidence.gamesApproved + evidence.galleryPieces + evidence.archiveContributions;
  if (creations >= 3) {
    suggested = 'creator';
    reasons.push(
      [
        evidence.gamesApproved > 0 ? `${evidence.gamesApproved} published game(s)` : null,
        evidence.galleryPieces > 0 ? `${evidence.galleryPieces} Gallery piece(s)` : null,
        evidence.archiveContributions > 0
          ? `${evidence.archiveContributions} Archive contribution(s)`
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    );
  }

  // ── Archivist: keeping the collection legible ─────────────────────────
  if (evidence.collectionsCurated >= 3 || evidence.archiveContributions >= 8) {
    suggested = 'archivist';
    reasons.push(
      `${evidence.collectionsCurated} curated collection(s) and ${evidence.archiveContributions} catalogued object(s)`,
    );
  }

  // ── Curator: staff trust, not accumulation ────────────────────────────
  if (evidence.curatorEndorsements >= 2) {
    suggested = 'curator';
    reasons.push('endorsed by staff for editorial judgement');
  }

  // ── Inner Arch: invitation only ───────────────────────────────────────
  if (evidence.innerArchInvited) {
    suggested = 'inner_arch';
    reasons.push('invited to the Inner Arch');
  }

  return { level: suggested, reason: reasons[0] ?? 'new member', evidence: reasons };
}

export interface LevelGrant {
  userId: string;
  toLevel: MemberLevel;
  basis: string;
  grantedBy: string | null;
}

/** Applies a level change and records why. */
export async function grantLevel(grant: LevelGrant): Promise<boolean> {
  const rows = await db
    .select({ level: users.level })
    .from(users)
    .where(eq(users.id, grant.userId))
    .limit(1);

  const current = rows[0]?.level as MemberLevel | undefined;
  if (!current || current === grant.toLevel) return false;

  await db.update(users).set({ level: grant.toLevel }).where(eq(users.id, grant.userId));

  await db.insert(levelHistory).values({
    userId: grant.userId,
    fromLevel: current,
    toLevel: grant.toLevel,
    basis: grant.basis,
    grantedBy: grant.grantedBy,
  });

  return true;
}

export async function levelHistoryFor(userId: string) {
  return db
    .select({
      fromLevel: levelHistory.fromLevel,
      toLevel: levelHistory.toLevel,
      basis: levelHistory.basis,
      createdAt: levelHistory.createdAt,
    })
    .from(levelHistory)
    .where(eq(levelHistory.userId, userId))
    .orderBy(desc(levelHistory.createdAt))
    .limit(50);
}

// ═══════════════════════════════════════════════════════════════════════════
// The Inner Arch
// ═══════════════════════════════════════════════════════════════════════════

export async function grantInnerArch(
  userId: string,
  invitedBy: string | null,
  focus: string,
): Promise<void> {
  await db
    .insert(innerArchMembers)
    .values({ userId, invitedBy, focus, standing: 'member' })
    .onConflictDoUpdate({
      target: innerArchMembers.userId,
      set: { removedAt: null, invitedBy, focus, joinedAt: new Date() },
    });

  await grantLevel({
    userId,
    toLevel: 'inner_arch',
    basis: focus || 'Invited to the Inner Arch.',
    grantedBy: invitedBy,
  });
}

export async function isInnerArch(userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: innerArchMembers.userId })
    .from(innerArchMembers)
    .where(and(eq(innerArchMembers.userId, userId), isNull(innerArchMembers.removedAt)))
    .limit(1);
  return rows.length > 0;
}

export async function innerArchRoster() {
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      level: users.level,
      focus: innerArchMembers.focus,
      standing: innerArchMembers.standing,
      joinedAt: innerArchMembers.joinedAt,
    })
    .from(innerArchMembers)
    .innerJoin(users, eq(users.id, innerArchMembers.userId))
    .where(isNull(innerArchMembers.removedAt))
    .orderBy(desc(innerArchMembers.joinedAt));

  return rows.map((row) => ({
    ...row,
    memberId: `ARCH-${String(row.memberId).padStart(6, '0')}`,
    levelLabel: MEMBER_LEVELS[row.level as MemberLevel]?.label ?? 'Member',
    glyph: MEMBER_LEVELS[row.level as MemberLevel]?.glyph ?? '✦',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Invitations
// ═══════════════════════════════════════════════════════════════════════════

export async function createInvitation(input: {
  code: string;
  tier: string;
  createdBy: string;
  maxUses: number;
  note: string;
  expiresAt: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(invitations)
    .values({
      code: input.code.toUpperCase(),
      tier: input.tier,
      createdBy: input.createdBy,
      maxUses: Math.max(1, Math.min(input.maxUses, 500)),
      note: input.note,
      expiresAt: input.expiresAt,
    })
    .returning({ id: invitations.id });

  return row!.id;
}

export async function listInvitations(limit = 40) {
  return db
    .select({
      id: invitations.id,
      code: invitations.code,
      tier: invitations.tier,
      uses: invitations.uses,
      maxUses: invitations.maxUses,
      expiresAt: invitations.expiresAt,
      note: invitations.note,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
    .limit(limit);
}

// ═══════════════════════════════════════════════════════════════════════════
// Achievements
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Definitions seeded by db/seed.ts. Kept here as a typed view so the unlock
 * logic below reads as intent rather than string matching.
 */
export const ACHIEVEMENT_KEYS = {
  firstPost: 'first_post',
  firstUpload: 'first_upload',
  firstArchiveContribution: 'first_archive',
  firstGame: 'first_game',
  curator: 'curator',
  host: 'host',
  collector: 'collector',
  nightOwl: 'night_owl',
  earlyBird: 'early_bird',
  archivist: 'archivist',
  innerArch: 'inner_arch',
} as const;

export interface UnlockContext {
  userId: string;
  now?: Date;
}

/**
 * Unlocks an achievement if it has not been unlocked yet.
 *
 * Silent by design for hidden achievements: the member is not notified, and the
 * entry appears in The Registry only once found. Core achievements produce a
 * notification via the caller.
 */
export async function maybeUnlock(
  key: keyof typeof ACHIEVEMENT_KEYS,
  context: UnlockContext,
): Promise<boolean> {
  const rows = await db
    .select({ id: achievements.id })
    .from(achievements)
    .where(eq(achievements.key, ACHIEVEMENT_KEYS[key]))
    .limit(1);

  const definition = rows[0];
  if (!definition) return false;

  const inserted = await db
    .insert(userAchievements)
    .values({ userId: context.userId, achievementId: definition.id })
    .onConflictDoNothing()
    .returning({ achievementId: userAchievements.achievementId });

  return inserted.length > 0;
}

/** Evaluates the context-dependent achievements for a member. */
export async function evaluateSituational(context: UnlockContext): Promise<string[]> {
  const now = context.now ?? new Date();
  const unlocked: string[] = [];

  const hour = now.getUTCHours();
  if (hour >= 0 && hour < 5) {
    if (await maybeUnlock('nightOwl', context)) unlocked.push(ACHIEVEMENT_KEYS.nightOwl);
  }
  if (hour >= 5 && hour < 8) {
    if (await maybeUnlock('earlyBird', context)) unlocked.push(ACHIEVEMENT_KEYS.earlyBird);
  }

  return unlocked;
}

export { LEVEL_ORDER };