import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import {
  connectionInterests,
  connectionPreferences,
  interests as interestsTable,
  profiles,
  userConnectionInterests,
  userInterests,
  userSettings,
  users,
} from '~db/schema';
import { CONNECTION_INTERESTS } from '~/lib/domain';

/**
 * Onboarding context
 *
 * Everything the wizard needs to render itself as a resume rather than a
 * restart, gathered in one query round so the first paint is not blocked behind
 * six sequential reads.
 */
export interface OnboardingContext {
  profile: {
    displayName: string;
    headline: string | null;
    bio: string | null;
    pronouns: string | null;
    institution: string | null;
    fieldOfStudy: string | null;
    region: string | null;
    skills: Array<{ key: string; label: string }>;
    links: Array<{ label: string; url: string }>;
  };
  interests: string[];
  settings: {
    profileVisibility: 'public' | 'members' | 'connections' | 'private';
    discoverable: boolean;
    showActivity: boolean;
    showCreations: boolean;
    showArchiveContributions: boolean;
    showRegion: boolean;
    messagePolicy: 'everyone' | 'members' | 'connections' | 'nobody';
  };
  connections: {
    enabled: boolean;
    friendshipOptIn: boolean;
    collaborationOptIn: boolean;
    datingOptIn: boolean;
    showInDating: boolean;
    datingIntent: string | null;
    interests: string[];
  };
}

export async function loadOnboardingContext(userId: string): Promise<OnboardingContext> {
  const [profileRows, settingsRows, interestRows, prefRows, connectionInterestRows, userRows] =
    await Promise.all([
      db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db
        .select({ key: interestsTable.key })
        .from(userInterests)
        .innerJoin(interestsTable, eq(interestsTable.id, userInterests.interestId))
        .where(eq(userInterests.userId, userId)),
      db
        .select()
        .from(connectionPreferences)
        .where(eq(connectionPreferences.userId, userId))
        .limit(1),
      db
        .select({ label: connectionInterests.label, mode: connectionInterests.mode })
        .from(userConnectionInterests)
        .innerJoin(
          connectionInterests,
          eq(connectionInterests.id, userConnectionInterests.interestId),
        )
        .where(eq(userConnectionInterests.userId, userId)),
      db.select({ region: users.region, displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1),
    ]);

  const profile = profileRows[0];
  const settings = settingsRows[0];
  const prefs = prefRows[0];

  return {
    profile: {
      displayName: userRows[0]?.displayName ?? '',
      headline: profile?.headline ?? null,
      bio: profile?.bio ?? null,
      pronouns: profile?.pronouns ?? null,
      institution: profile?.institution ?? null,
      fieldOfStudy: profile?.fieldOfStudy ?? null,
      region: userRows[0]?.region ?? null,
      skills: profile?.skills ?? [],
      links: profile?.links ?? [],
    },
    interests: interestRows.map((row) => row.key),
    settings: {
      profileVisibility: settings?.profileVisibility ?? 'members',
      discoverable: settings?.discoverable ?? true,
      showActivity: settings?.showActivity ?? true,
      showCreations: settings?.showCreations ?? true,
      showArchiveContributions: settings?.showArchiveContributions ?? true,
      showRegion: settings?.showRegion ?? false,
      messagePolicy: (settings?.messagePolicy ?? 'members') as OnboardingContext['settings']['messagePolicy'],
    },
    connections: {
      enabled: settings?.connectionsEnabled ?? false,
      friendshipOptIn: prefs?.friendshipOptIn ?? false,
      collaborationOptIn: prefs?.collaborationOptIn ?? false,
      datingOptIn: prefs?.datingOptIn ?? false,
      showInDating: prefs?.showInDating ?? false,
      datingIntent: prefs?.datingIntent ?? null,
      interests: connectionInterestRows.map((row) => row.label),
    },
  };
}

/** The picker catalogue, grouped by mode. */
export function connectionInterestCatalogue(): Array<{
  mode: string;
  items: Array<{ label: string; weight: number }>;
}> {
  const modes = ['friendship', 'collaboration', 'dating'] as const;
  return modes.map((mode) => ({
    mode,
    items: CONNECTION_INTERESTS.filter((entry) => entry.mode === mode).map((entry) => ({
      label: entry.label,
      weight: entry.weight,
    })),
  }));
}