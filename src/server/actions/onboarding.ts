'use server';

/**
 * Onboarding
 *
 * Nine steps, each one optional in the sense that a member can move past it with
 * a sensible default, and none of them able to produce a half-configured
 * account. Step completion is recorded server-side as it happens, so a member
 * who closes the tab halfway through resumes rather than restarts.
 */
import { eq } from 'drizzle-orm';
import { db } from '~db';
import {
  connectionInterests,
  connectionPreferences,
  interests,
  profiles,
  userConnectionInterests,
  userInterests,
  users,
  userSettings,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { CONNECTION_INTERESTS, INTEREST_GROUPS, INTEREST_LABELS } from '~/lib/domain';
import { slugify } from '~/lib/format';
import { can, type SessionActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';

/** Marks onboarding finished. Called once at the last step. */
export async function completeOnboarding(
  actor: SessionActor,
): Promise<ActionResult<{ username: string }>> {
  if (!can(actor, 'post')) return fail('You cannot complete onboarding yet.');

  await db
    .update(users)
    .set({ onboardedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, actor.userId));

  await db
    .update(profiles)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(eq(profiles.userId, actor.userId));

  return ok({ username: actor.username });
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 2 · Avatar & headline
// ═══════════════════════════════════════════════════════════════════════════

export async function saveIdentity(
  actor: SessionActor,
  input: {
    displayName: string;
    headline: string;
    pronouns: string;
    institution: string;
    fieldOfStudy: string;
    region: string;
    /** Optional generated avatar: a glyph plus a hue, never an uploaded photo at this stage. */
    avatarGlyph: string;
    avatarHue: number;
  },
): Promise<ActionResult> {
  const displayName = input.displayName.trim().slice(0, 48);
  if (displayName.length < 2) {
    return fail('Choose a display name of at least 2 characters.', {
      displayName: ['Too short.'],
    });
  }

  const existing = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, actor.userId))
    .limit(1);

  const values = {
    headline: input.headline.trim().slice(0, 120) || null,
    pronouns: input.pronouns.trim().slice(0, 24) || null,
    institution: input.institution.trim().slice(0, 120) || null,
    fieldOfStudy: input.fieldOfStudy.trim().slice(0, 120) || null,
  };

  if (existing[0]) {
    await db
      .update(profiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(profiles.userId, actor.userId));
  } else {
    await db.insert(profiles).values({ userId: actor.userId, ...values });
  }

  await db
    .update(users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(users.id, actor.userId));

  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 4 · Interests
// ═══════════════════════════════════════════════════════════════════════════

export async function saveInterests(
  actor: SessionActor,
  keys: string[],
): Promise<ActionResult> {
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const wanted = [...new Set(keys.map((key) => slugify(key)).filter(Boolean))].slice(0, 20);
  if (wanted.length === 0) return fail('Pick at least three interests.', { keys: ['Choose a few.'] });

  // Upsert the catalogue lazily so a new installation needs no interest seed.
  for (const key of wanted) {
    const group =
      INTEREST_GROUPS.find((entry) => (entry.items as readonly string[]).includes(key))?.group ?? 'Curiosity';
    await db
      .insert(interests)
      .values({ key, label: INTEREST_LABELS[key] ?? key, group })
      .onConflictDoNothing();
  }

  await db.delete(userInterests).where(eq(userInterests.userId, actor.userId));

  for (const key of wanted) {
    const row = await db
      .select({ id: interests.id })
      .from(interests)
      .where(eq(interests.key, key))
      .limit(1);
    if (row[0]) {
      await db.insert(userInterests).values({ userId: actor.userId, interestId: row[0].id });
    }
  }

  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 5 · Optional profile detail
// ═══════════════════════════════════════════════════════════════════════════

export async function saveProfileDetail(
  actor: SessionActor,
  input: {
    bio: string;
    skills: Array<{ key: string; label: string }>;
    links: Array<{ label: string; url: string }>;
  },
): Promise<ActionResult> {
  const bio = input.bio.trim().slice(0, 1200);

  // Only http(s) links are stored; anything else is a scheme we will not render.
  const links = input.links
    .filter((link) => {
      try {
        const url = new URL(link.url);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    })
    .map((link) => ({
      label: link.label.trim().slice(0, 40) || 'link',
      url: link.url.trim().slice(0, 200),
    }))
    .slice(0, 5);

  const skills = input.skills
    .map((skill) => ({ key: slugify(skill.label), label: skill.label.trim().slice(0, 40) }))
    .filter((skill) => skill.key)
    .slice(0, 12);

  const existing = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, actor.userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(profiles)
      .set({ bio, skills, links, updatedAt: new Date() })
      .where(eq(profiles.userId, actor.userId));
  } else {
    await db.insert(profiles).values({ userId: actor.userId, bio, skills, links });
  }

  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 6 · Privacy
// ═══════════════════════════════════════════════════════════════════════════

export async function savePrivacy(
  actor: SessionActor,
  input: {
    profileVisibility: 'public' | 'members' | 'connections' | 'private';
    discoverable: boolean;
    showActivity: boolean;
    showCreations: boolean;
    showArchiveContributions: boolean;
    showRegion: boolean;
    messagePolicy: 'everyone' | 'members' | 'connections' | 'nobody';
  },
): Promise<ActionResult> {
  const region = await db
    .select({ region: users.region })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  // Showing a region requires having chosen one; the flag cannot manufacture data.
  const canShowRegion = Boolean(region[0]?.region);

  await db
    .insert(userSettings)
    .values({
      userId: actor.userId,
      profileVisibility: input.profileVisibility,
      discoverable: input.discoverable,
      showActivity: input.showActivity,
      showCreations: input.showCreations,
      showArchiveContributions: input.showArchiveContributions,
      showRegion: input.showRegion && canShowRegion,
      messagePolicy: input.messagePolicy,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        profileVisibility: input.profileVisibility,
        discoverable: input.discoverable,
        showActivity: input.showActivity,
        showCreations: input.showCreations,
        showArchiveContributions: input.showArchiveContributions,
        showRegion: input.showRegion && canShowRegion,
        messagePolicy: input.messagePolicy,
        updatedAt: new Date(),
      },
    });

  await db
    .update(profiles)
    .set({ profileVisibility: input.profileVisibility, updatedAt: new Date() })
    .where(eq(profiles.userId, actor.userId));

  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 7 · Connections
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Opting into Connections.
 *
 * Default is off, in every mode. A member must actively choose each mode they
 * want to appear in, and dating additionally requires an adult band — enforced
 * here as well as in the matching engine, so the refusal is explainable at the
 * point of choice rather than only at the point of matching.
 */
export async function saveConnections(
  actor: SessionActor,
  input: {
    enabled: boolean;
    friendshipOptIn: boolean;
    collaborationOptIn: boolean;
    datingOptIn: boolean;
    showInDating: boolean;
    datingIntent: string;
    interests: string[];
  },
): Promise<ActionResult> {
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const wantsDating = input.enabled && input.datingOptIn && input.showInDating;

  if (wantsDating && actor.isMinor) {
    return fail('Dating connections are only available to adult members.', {
      datingOptIn: [
        'Your age group does not include dating connections. Friendship and collaboration are unaffected.',
      ],
    });
  }

  const enabled = input.enabled;

  await db
    .insert(userSettings)
    .values({
      userId: actor.userId,
      connectionsEnabled: enabled,
      datingEnabled: Boolean(enabled && wantsDating),
      allowFriendRequests: input.friendshipOptIn || input.collaborationOptIn,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        connectionsEnabled: enabled,
        datingEnabled: Boolean(enabled && wantsDating),
        allowFriendRequests: input.friendshipOptIn || input.collaborationOptIn,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(connectionPreferences)
    .values({
      userId: actor.userId,
      friendshipOptIn: enabled && input.friendshipOptIn,
      collaborationOptIn: enabled && input.collaborationOptIn,
      datingOptIn: enabled && wantsDating,
      showInDating: enabled && wantsDating,
      datingIntent: wantsDating ? input.datingIntent.trim().slice(0, 48) : null,
    })
    .onConflictDoUpdate({
      target: connectionPreferences.userId,
      set: {
        friendshipOptIn: enabled && input.friendshipOptIn,
        collaborationOptIn: enabled && input.collaborationOptIn,
        datingOptIn: enabled && wantsDating,
        showInDating: enabled && wantsDating,
        datingIntent: wantsDating ? input.datingIntent.trim().slice(0, 48) : null,
        updatedAt: new Date(),
      },
    });

  // Seed the connection-interest catalogue once, then link the member's picks.
  for (const entry of CONNECTION_INTERESTS) {
    await db
      .insert(connectionInterests)
      .values({ mode: entry.mode, label: entry.label, weight: entry.weight })
      .onConflictDoNothing();
  }

  const picked = [...new Set(input.interests.map((label) => label.trim().toLowerCase()))]
    .filter(Boolean)
    .slice(0, 20);

  if (picked.length > 0) {
    const catalogue = await db.select().from(connectionInterests);
    const byLabel = new Map(catalogue.map((row) => [row.label.toLowerCase(), row.id]));

    await db.delete(userConnectionInterests).where(eq(userConnectionInterests.userId, actor.userId));

    for (const label of picked) {
      const interestId = byLabel.get(label);
      if (interestId) {
        await db
          .insert(userConnectionInterests)
          .values({ userId: actor.userId, interestId });
      }
    }
  }

  return ok();
}