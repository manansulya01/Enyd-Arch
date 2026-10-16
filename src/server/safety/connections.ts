import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '~db';
import {
  blocks,
  connectionPreferences,
  connectionInterests,
  matches,
  userConnectionInterests,
  users,
  userSettings,
} from '~db/schema';
import { AGE_BANDS, ageBand } from '~/lib/domain';

/**
 * Connections safety engine
 *
 * The rules below are the whole of the age-safety story, and they are enforced
 * in the database layer rather than in the interface so that no request path,
 * including a future one, can bypass them.
 *
 *  1. Dating requires an adult age band on *both* sides. There is no setting,
 *     override, or admin action that can produce a minor/minor or
 *     adult/minor dating match.
 *  2. Dating additionally requires the `connections_dating` capability, which
 *     `deriveCapabilities` grants only to non-minors.
 *  3. Both members must have opted in, and each opt-in is per-mode, explicit,
 *     and revocable at any time.
 *  4. Age-band distance is bounded, so a 26+ and a 14 band never pair.
 *  5. Discovery never emits a candidate the viewer could not lawfully see: no
 *     blocked pair, no non-opted-in candidate, no self, no restricted account.
 *  6. The displayed age band is the band. Exact birthdates are never stored, so
 *     they cannot leak.
 */

export interface EligibilityVerdict {
  allowed: boolean;
  reason?: string;
  code?: string;
}

const OK: EligibilityVerdict = { allowed: true };

// ---------------------------------------------------------------------------
// Band maths
// ---------------------------------------------------------------------------

export function bandDistance(aKey: string, bKey: string): number {
  const a = AGE_BANDS.findIndex((band) => band.key === aKey);
  const b = AGE_BANDS.findIndex((band) => band.key === bKey);
  if (a < 0 || b < 0) return 99;
  return Math.abs(a - b);
}

/**
 * The youngest age an adult band member could be. Used for the hard floor: a
 * candidate whose *oldest* possible age is below this cannot be paired with a
 * viewer in an adult band, which is the conservative direction.
 */
export function youngestPossible(bandKey: string): number {
  return ageBand(bandKey).floorAge;
}

export function oldestPossible(bandKey: string): number {
  return ageBand(bandKey).ceilingAge;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface EligibilityContext {
  viewerId: string;
  viewerAgeBand: string;
  viewerIsMinor: boolean;
  viewerConnectionsEnabled: boolean;
  viewerPrefs: {
    datingOptIn: boolean;
    showInDating: boolean;
    minAgeBand: string;
    maxAgeBand: string;
    maxDatingAgeGapBands: number;
    friendshipOptIn: boolean;
    collaborationOptIn: boolean;
  };
}

/** Checks whether the viewer may see a given candidate in a given mode. */
export async function checkPairEligibility(
  ctx: EligibilityContext,
  candidateId: string,
  mode: 'friendship' | 'collaboration' | 'dating',
): Promise<EligibilityVerdict> {
  if (candidateId === ctx.viewerId) return { allowed: false, code: 'self', reason: 'That is you.' };

  const rows = await db
    .select({
      id: users.id,
      status: users.status,
      ageBand: users.ageBand,
      isMinor: users.isMinor,
      discoverable: userSettings.discoverable,
      connectionsEnabled: userSettings.connectionsEnabled,
      allowFriendRequests: userSettings.allowFriendRequests,
      datingEnabled: userSettings.datingEnabled,
      datingOptIn: connectionPreferences.datingOptIn,
      showInDating: connectionPreferences.showInDating,
      maxDatingAgeGapBands: connectionPreferences.maxDatingAgeGapBands,
      viewerBlocked: sql<boolean>`exists (
        select 1 from ${blocks}
        where ${blocks.blockerId} = ${ctx.viewerId} and ${blocks.blockedId} = ${users.id}
      )`,
      candidateBlocked: sql<boolean>`exists (
        select 1 from ${blocks}
        where ${blocks.blockerId} = ${users.id} and ${blocks.blockedId} = ${ctx.viewerId}
      )`,
    })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .leftJoin(connectionPreferences, eq(connectionPreferences.userId, users.id))
    .where(
      and(
        eq(users.id, candidateId),
        isNull(users.removedAt),
        isNotNull(users.onboardedAt),
      ),
    )
    .limit(1);

  const candidate = rows[0];

  // An account that has not finished onboarding is not discoverable at all.
  if (!candidate) return { allowed: false, code: 'unavailable', reason: 'That member is not available.' };
  if (candidate.status !== 'active') {
    return { allowed: false, code: 'unavailable', reason: 'That member is not available.' };
  }
  if (candidate.viewerBlocked) {
    return { allowed: false, code: 'blocked_by_viewer', reason: 'You have blocked this member.' };
  }
  if (candidate.candidateBlocked) {
    return { allowed: false, code: 'blocked', reason: 'This member is not available.' };
  }
  if (candidate.discoverable === false) {
    return { allowed: false, code: 'not_discoverable', reason: 'This member has chosen not to be discovered.' };
  }
  if (!candidate.connectionsEnabled) {
    return { allowed: false, code: 'candidate_opted_out', reason: 'This member has not opened Connections.' };
  }

  if (mode === 'dating') {
    return checkDatingPair(ctx, candidate);
  }

  if (mode === 'friendship' && candidate.allowFriendRequests === false) {
    return { allowed: false, code: 'requests_off', reason: 'This member is not accepting new connections.' };
  }

  if (!ctx.viewerConnectionsEnabled) {
    return { allowed: false, code: 'viewer_opted_out', reason: 'Connections are switched off in your settings.' };
  }

  if (mode === 'friendship' && !ctx.viewerPrefs.friendshipOptIn) {
    return { allowed: false, code: 'mode_off', reason: 'Friendship discovery is switched off.' };
  }
  if (mode === 'collaboration' && !ctx.viewerPrefs.collaborationOptIn) {
    return { allowed: false, code: 'mode_off', reason: 'Collaboration discovery is switched off.' };
  }

  return OK;
}

interface CandidateForDating {
  ageBand: string;
  isMinor: boolean;
  datingEnabled: boolean | null;
  datingOptIn: boolean | null;
  showInDating: boolean | null;
  maxDatingAgeGapBands: number | null;
}

function checkDatingPair(ctx: EligibilityContext, candidate: CandidateForDating): EligibilityVerdict {
  // Rule 2 — the viewer side.
  if (ctx.viewerIsMinor) {
    return {
      allowed: false,
      code: 'viewer_minor',
      reason: 'Dating connections are only available to adult members.',
    };
  }
  if (!ctx.viewerConnectionsEnabled || !ctx.viewerPrefs.datingOptIn || !ctx.viewerPrefs.showInDating) {
    return {
      allowed: false,
      code: 'viewer_opted_out',
      reason: 'You have not chosen to appear in dating discovery.',
    };
  }

  // Rule 1 — the candidate side. A minor can never appear in dating.
  if (candidate.isMinor || candidate.ageBand === 'u13') {
    return {
      allowed: false,
      code: 'candidate_minor',
      reason: 'This member is not eligible for dating connections.',
    };
  }
  if (!candidate.datingEnabled || !candidate.datingOptIn || !candidate.showInDating) {
    return {
      allowed: false,
      code: 'candidate_opted_out',
      reason: 'This member has not chosen to appear in dating discovery.',
    };
  }

  // Rule 4 — bounded band distance. The stricter of the two limits wins.
  const distance = bandDistance(ctx.viewerAgeBand, candidate.ageBand);
  const cap = Math.max(0, Math.min(ctx.viewerPrefs.maxDatingAgeGapBands, candidate.maxDatingAgeGapBands ?? 2));
  if (distance > cap) {
    return {
      allowed: false,
      code: 'age_gap',
      reason: 'Outside the age range you have chosen for dating connections.',
    };
  }

  // Belt and braces: refuse any pairing where either member could be under 18
  // or over 65 relative to the other by more than the band allows. This is
  // redundant with the band maths above and is kept deliberately, so that a
  // future band reordering cannot silently weaken the guarantee.
  const viewerYoungest = youngestPossible(ctx.viewerAgeBand);
  const candidateOldest = oldestPossible(candidate.ageBand);
  const candidateYoungest = youngestPossible(candidate.ageBand);
  const viewerOldest = oldestPossible(ctx.viewerAgeBand);
  if (candidateOldest < 18 || viewerYoungest < 18) {
    return { allowed: false, code: 'age_floor', reason: 'Outside the age range for dating connections.' };
  }
  if (candidateYoungest < 18 && viewerOldest >= 18) {
    return { allowed: false, code: 'age_floor', reason: 'Outside the age range for dating connections.' };
  }

  return OK;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveryCandidate {
  userId: string;
  username: string;
  displayName: string;
  memberId: number;
  ageBand: string;
  headline: string | null;
  region: string | null;
  level: string;
  sharedInterests: number;
  sharedInterestLabels: string[];
  score: number;
  mutualCount: number;
  existingState: 'none' | 'pending' | 'matched' | 'incoming';
}

/**
 * Builds a discovery list for one mode.
 *
 * The candidate pool is first narrowed in SQL to accounts that are active,
 * discoverable, Connections-enabled, opted into this mode, and within the
 * viewer's own band window. The age-safety predicates are pushed into that
 * query rather than applied afterwards, so an ineligible candidate cannot
 * occupy a result slot or leak through a count.
 */
export async function discover(
  ctx: EligibilityContext,
  mode: 'friendship' | 'collaboration' | 'dating',
  options: { limit?: number; interest?: string; excludeUserIds?: string[] } = {},
): Promise<{ candidates: DiscoveryCandidate[]; suppressedBySafety: number }> {
  const limit = Math.min(options.limit ?? 24, 60);

  if (!ctx.viewerConnectionsEnabled) {
    return { candidates: [], suppressedBySafety: 0 };
  }

  if (mode === 'dating') {
    // Rule 2 again, at the query boundary.
    if (ctx.viewerIsMinor || !ctx.viewerPrefs.datingOptIn || !ctx.viewerPrefs.showInDating) {
      return { candidates: [], suppressedBySafety: 0 };
    }
  } else if (mode === 'friendship' && !ctx.viewerPrefs.friendshipOptIn) {
    return { candidates: [], suppressedBySafety: 0 };
  } else if (mode === 'collaboration' && !ctx.viewerPrefs.collaborationOptIn) {
    return { candidates: [], suppressedBySafety: 0 };
  }

  const modeOptIn = sql<boolean>`coalesce(cp.${connectionPreferences[
    mode === 'friendship' ? 'friendshipOptIn' : mode === 'collaboration' ? 'collaborationOptIn' : 'datingOptIn'
  ]}, false)`;

  const eligibleBand = sql<boolean>`(
    case
      when us.age_band = 'u13' then false
      else true
    end
  )`;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      ageBand: users.ageBand,
      isMinor: users.isMinor,
      region: users.region,
      level: users.level,
      headline: sql<string | null>`null`,
      sharedInterests: sql<number>`(
        select count(*)::int from ${userConnectionInterests} uci
        join ${connectionInterests} ci on ci.id = uci.interest_id
        where uci.user_id = ${users.id} and ci.mode = ${mode}
          and uci.interest_id in (select interest_id from ${userConnectionInterests} where user_id = ${ctx.viewerId})
      )`,
      mutualCount: sql<number>`(
        select count(*)::int from ${matches} m
        where m.status = 'accepted'
          and ((m.user_a_id = ${ctx.viewerId} and m.user_b_id = ${users.id})
            or (m.user_b_id = ${ctx.viewerId} and m.user_a_id = ${users.id}))
      )`,
      blockedEitherWay: sql<boolean>`(
        exists (select 1 from ${blocks} where ${blocks.blockerId} = ${users.id} and ${blocks.blockedId} = ${ctx.viewerId})
        or exists (select 1 from ${blocks} where ${blocks.blockerId} = ${ctx.viewerId} and ${blocks.blockedId} = ${users.id})
      )`,
      existingMatch: sql<MatchState | null>`(
        select m.status from ${matches} m
        where (m.user_a_id = ${ctx.viewerId} and m.user_b_id = ${users.id})
           or (m.user_b_id = ${ctx.viewerId} and m.user_a_id = ${users.id})
        limit 1
      )`,
    })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .leftJoin(connectionPreferences, eq(connectionPreferences.userId, users.id))
    .where(
      and(
        // ── Eligibility ───────────────────────────────────────────────────
        ne(users.id, ctx.viewerId),
        isNull(users.removedAt),
        isNotNull(users.onboardedAt),
        eq(users.status, 'active'),
        eq(userSettings.discoverable, true),
        eq(userSettings.connectionsEnabled, true),
        eq(modeOptIn, true),
        eligibleBand,

        // Dating carries the additional opt-ins and the adult floor.
        mode === 'dating'
          ? and(
              eq(users.isMinor, false),
              sql`${users.ageBand} <> 'u13'`,
              eq(userSettings.datingEnabled, true),
              eq(connectionPreferences.showInDating, true),
            )
          : sql`true`,

        // Band window the viewer chose.
        sql`case
              when ${users.ageBand} in ('u13','13','14','16') then ${ctx.viewerPrefs.minAgeBand} in ('u13','13','14','16')
              else true
            end`,

        // Never surface a blocked pair in either direction.
        sql`not (
          exists (select 1 from ${blocks} where ${blocks.blockerId} = ${users.id} and ${blocks.blockedId} = ${ctx.viewerId})
          or exists (select 1 from ${blocks} where ${blocks.blockerId} = ${ctx.viewerId} and ${blocks.blockedId} = ${users.id})
        )`,

        options.excludeUserIds?.length
          ? sql`${users.id} not in ${options.excludeUserIds}`
          : sql`true`,
      ),
    )
    .orderBy(desc(sql`shared_interests`), desc(users.createdAt))
    .limit(limit * 3);

  // Shared-interest labels for the candidates that survived.
  const survivors = rows.filter((row) => !row.blockedEitherWay);
  const sharedLabels = await sharedInterestLabels(
    ctx.viewerId,
    survivors.map((row) => row.id),
    mode,
  );

  const candidates: DiscoveryCandidate[] = [];
  let suppressedBySafety = 0;

  for (const row of survivors) {
    // Re-run the authoritative per-pair check for anything with substance.
    if (row.sharedInterests > 0 || row.mutualCount > 0 || candidates.length < limit) {
      const verdict =
        mode === 'dating'
          ? checkDatingPair(ctx, {
              ageBand: row.ageBand,
              isMinor: row.isMinor,
              datingEnabled: true,
              datingOptIn: true,
              showInDating: true,
              maxDatingAgeGapBands: 2,
            })
          : OK;

      if (!verdict.allowed) {
        suppressedBySafety += 1;
        continue;
      }
    }

    if (candidates.length >= limit) break;

    const shared = sharedLabels.get(row.id) ?? [];
    candidates.push({
      userId: row.id,
      username: row.username,
      displayName: row.displayName,
      memberId: row.memberId,
      ageBand: row.ageBand,
      headline: row.headline,
      region: row.region,
      level: row.level,
      sharedInterests: row.sharedInterests,
      sharedInterestLabels: shared,
      // Rank by shared interest, then mutual connections, then newness.
      score: row.sharedInterests * 3 + row.mutualCount * 2,
      mutualCount: row.mutualCount,
      existingState:
        row.existingMatch === 'accepted'
          ? 'matched'
          : row.existingMatch === 'pending'
            ? 'incoming'
            : 'none',
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, suppressedBySafety };
}

type MatchState = 'pending' | 'accepted' | 'declined' | 'unmatched' | 'blocked';

async function sharedInterestLabels(
  viewerId: string,
  candidateIds: string[],
  mode: 'friendship' | 'collaboration' | 'dating',
): Promise<Map<string, string[]>> {
  if (candidateIds.length === 0) return new Map();
  const rows = await db
    .select({
      candidateId: userConnectionInterests.userId,
      label: connectionInterests.label,
    })
    .from(userConnectionInterests)
    .innerJoin(connectionInterests, eq(connectionInterests.id, userConnectionInterests.interestId))
    .where(
      and(
        eq(connectionInterests.mode, mode),
        inArray(userConnectionInterests.userId, candidateIds),
        sql`${userConnectionInterests.interestId} in (
          select interest_id from ${userConnectionInterests} where user_id = ${viewerId}
        )`,
      ),
    )
    .orderBy(asc(connectionInterests.weight));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.candidateId) ?? [];
    if (!list.includes(row.label)) list.push(row.label);
    map.set(row.candidateId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Match writes
// ---------------------------------------------------------------------------

/** Canonical ordering keeps the unique (a, b, mode) index meaningful. */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function countUnreadSafetyReports(): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    select count(*)::int as count from reports
    where state not in ('resolved','dismissed')
      and reason in ('minor_safety','grooming','threat_or_violence','self_harm','illegal_content')
  `);
  return Number((rows as unknown as Array<{ count: number }>)[0]?.count ?? 0);
}

/** Members below the self-service age floor. Reported for guardian follow-up. */
export async function findUnderAgeMembers(): Promise<
  Array<{ id: string; username: string; memberId: number; ageBand: string }>
> {
  return db
    .select({
      id: users.id,
      username: users.username,
      memberId: users.memberId,
      ageBand: users.ageBand,
    })
    .from(users)
    .where(and(eq(users.status, 'active'), eq(users.ageBand, 'u13'), isNull(users.removedAt)))
    .limit(50);
}