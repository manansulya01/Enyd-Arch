import 'server-only';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '~db';
import {
  achievements,
  archiveObjectTags,
  archiveObjects as archiveObjectTable,
  blocks,
  bookmarks as bookmarkTable,
  collectionItems as collectionItemTable,
  collections as collectionTable,
  comments as commentTable,
  conversationMembers,
  conversations as conversationTable,
  connectionRequests,
  events as eventTable,
  films as filmTable,
  filmReviews,
  watchlists,
  watchlistItems,
  files,
  galleryAttachments,
  galleryPosts as galleryPostTable,
  games as gameTable,
  gameComments,
  hashtags,
  interests,
  matches as matchTable,
  messages as messageTable,
  notifications as notificationTable,
  postAttachments,
  postHashtags,
  posts as postTable,
  profiles,
  projects as projectTable,
  reactions,
  rsvps,
  userAchievements,
  userInterests,
  userFollows,
  userSettings,
  users,
} from '~db/schema';
import { ageBandLabel, formatMemberId, levelLabel } from '~/lib/domain';

/**
 * Read models
 *
 * Every function returns exactly what the interface is allowed to see. Private
 * columns — email, phone, legal name, exact location, IP hashes, device
 * fingerprints — are never selected. Visibility and block rules are applied in
 * the query, so a forgotten filter in a template cannot leak a row.
 */

export const tables = {
  post: postTable,
  comment: commentTable,
  archiveObject: archiveObjectTable,
  collection: collectionTable,
  collectionItem: collectionItemTable,
  galleryPost: galleryPostTable,
  game: gameTable,
  event: eventTable,
  conversation: conversationTable,
  message: messageTable,
  project: projectTable,
  notification: notificationTable,
  match: matchTable,
  rsvp: rsvps,
  user: users,
  profile: profiles,
  settings: userSettings,
  interest: interests,
  userInterest: userInterests,
  achievement: achievements,
  userAchievement: userAchievements,
  file: files,
  hashtag: hashtags,
  postHashtag: postHashtags,
  reaction: reactions,
  conversationMember: conversationMembers,
  block: blocks,
  archiveTag: archiveObjectTags,
  galleryAttachment: galleryAttachments,
  postAttachment: postAttachments,
};

// ═══════════════════════════════════════════════════════════════════════════
// Identity projection
// ═══════════════════════════════════════════════════════════════════════════

export interface MemberSummary {
  userId: string;
  username: string;
  displayName: string;
  memberId: string;
  memberNumber: number;
  level: string;
  levelLabel: string;
  avatarUrl: string | null;
  headline: string | null;
  ageBand: string;
  ageBandLabel: string;
  region: string | null;
  joinedAt: Date;
}

export interface MemberRow {
  id: string;
  username: string;
  displayName: string;
  memberId: number;
  level: string;
  ageBand: string;
  region: string | null;
  createdAt: Date;
  headline: string | null;
  avatarObjectId: string | null;
  showRegion: boolean | null;
  hideAgeBand: boolean | null;
}

const MEMBER_COLUMNS = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  memberId: users.memberId,
  level: users.level,
  ageBand: users.ageBand,
  region: users.region,
  createdAt: users.createdAt,
  headline: profiles.headline,
  avatarObjectId: profiles.avatarObjectId,
  showRegion: userSettings.showRegion,
  hideAgeBand: userSettings.hideAgeBand,
};

const memberJoin = () =>
  db
    .select(MEMBER_COLUMNS)
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id));

/**
 * Reduces a database row to the public identity of a member.
 *
 * Two fields are member-controlled and therefore gated here rather than at
 * each call site: the age band (unless the member has hidden it) and the region
 * (only if the member chose to show it). Neither is ever a precise value.
 */
export function projectMember(row: MemberRow, viewerId?: string | null): MemberSummary {
  const isSelf = viewerId === row.id;
  const hideAge = row.hideAgeBand === true && !isSelf;

  return {
    userId: row.id,
    username: row.username,
    displayName: row.displayName,
    memberId: formatMemberId(row.memberId),
    memberNumber: row.memberId,
    level: row.level,
    levelLabel: levelLabel(row.level),
    avatarUrl: row.avatarObjectId ? `/objects/${row.avatarObjectId}` : null,
    headline: row.headline,
    ageBand: hideAge ? 'undisclosed' : row.ageBand,
    ageBandLabel: hideAge ? 'Undisclosed' : ageBandLabel(row.ageBand),
    region: row.showRegion ? row.region : null,
    joinedAt: row.createdAt,
  };
}

const resourceVisibleToViewer = (visibility: unknown, owner: unknown, viewerId: string) => sql`(
  ${owner as never} = ${viewerId}
  or ${visibility as never} in ('public', 'members')
  or (
    ${visibility as never} = 'connections'
    and exists (
      select 1 from ${matchTable} m
      where m.status = 'accepted'
        and (
          (m.user_a_id = ${owner as never} and m.user_b_id = ${viewerId})
          or (m.user_b_id = ${owner as never} and m.user_a_id = ${viewerId})
        )
    )
  )
)`;

const visibleMemberConditions = (viewerId?: string | null) =>
  and(
    eq(users.status, 'active'),
    isNull(users.removedAt),
    viewerId ? or(
      eq(users.id, viewerId),
      and(
        eq(userSettings.discoverable, true),
        resourceVisibleToViewer(profiles.profileVisibility, profiles.userId, viewerId),
        resourceVisibleToViewer(userSettings.profileVisibility, users.id, viewerId),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${users.id})
             or (b.blocker_id = ${users.id} and b.blocked_id = ${viewerId})
        )`,
      ),
    ) : and(
      eq(userSettings.discoverable, true),
      eq(profiles.profileVisibility, 'public'),
      eq(userSettings.profileVisibility, 'public'),
    ),
  );

export async function memberById(userId: string, viewerId?: string | null): Promise<MemberSummary | null> {
  const privacy = viewerId === userId
    ? eq(users.id, userId)
    : and(eq(users.id, userId), visibleMemberConditions(viewerId));
  const [row] = await memberJoin().where(privacy).limit(1);
  return row ? projectMember(row, viewerId) : null;
}

export async function memberByUsername(
  username: string,
  viewerId?: string | null,
): Promise<MemberSummary | null> {
  const identity = sql`lower(${users.username}) = lower(${username})`;
  const privacy = and(identity, visibleMemberConditions(viewerId));
  const [row] = await memberJoin().where(privacy).limit(1);
  return row ? projectMember(row, viewerId) : null;
}

export interface MemberProfileDetails {
  bio: string | null;
  pronouns: string | null;
  institution: string | null;
  fieldOfStudy: string | null;
  skills: Array<{ key: string; label: string }>;
  links: Array<{ label: string; url: string }>;
  showActivity: boolean;
  showCreations: boolean;
  showArchiveContributions: boolean;
}

export async function memberProfileDetails(
  userId: string,
  viewerId: string,
): Promise<MemberProfileDetails | null> {
  const [row] = await db
    .select({
      bio: profiles.bio,
      pronouns: profiles.pronouns,
      institution: profiles.institution,
      fieldOfStudy: profiles.fieldOfStudy,
      skills: profiles.skills,
      links: profiles.links,
      showActivity: userSettings.showActivity,
      showCreations: userSettings.showCreations,
      showArchiveContributions: userSettings.showArchiveContributions,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.id, userId), visibleMemberConditions(viewerId)))
    .limit(1);

  if (!row) return null;
  return {
    bio: row.bio ?? null,
    pronouns: row.pronouns ?? null,
    institution: row.institution ?? null,
    fieldOfStudy: row.fieldOfStudy ?? null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    links: Array.isArray(row.links) ? row.links : [],
    showActivity: row.showActivity ?? true,
    showCreations: row.showCreations ?? true,
    showArchiveContributions: row.showArchiveContributions ?? true,
  };
}

export interface MemberArchiveContribution {
  slug: string;
  title: string;
  category: string;
  createdAt: Date;
}

export async function memberArchiveContributions(
  userId: string,
  viewerId: string,
): Promise<MemberArchiveContribution[]> {
  return db
    .select({
      slug: archiveObjectTable.slug,
      title: archiveObjectTable.title,
      category: archiveObjectTable.category,
      createdAt: archiveObjectTable.createdAt,
    })
    .from(archiveObjectTable)
    .innerJoin(users, eq(users.id, archiveObjectTable.contributorId))
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(
      eq(archiveObjectTable.contributorId, userId),
      eq(userSettings.showArchiveContributions, true),
      eq(users.status, 'active'),
      isNull(users.removedAt),
      isNull(archiveObjectTable.removedAt),
      resourceVisibleToViewer(archiveObjectTable.visibility, archiveObjectTable.contributorId, viewerId),
      sql`not exists (
        select 1 from ${blocks} b
        where (b.blocker_id = ${viewerId} and b.blocked_id = ${userId})
           or (b.blocker_id = ${userId} and b.blocked_id = ${viewerId})
      )`,
    ))
    .orderBy(desc(archiveObjectTable.createdAt))
    .limit(8);
}

export async function memberDirectory(
  viewerId: string,
  options: { query?: string | null; level?: string | null; limit?: number } = {},
): Promise<MemberSummary[]> {
  const term = (options.query ?? '').trim().slice(0, 60);
  const where = and(
    visibleMemberConditions(viewerId),
    sql`${users.id} <> ${viewerId}`,
    options.level ? eq(users.level, options.level as never) : sql`true`,
    term
      ? sql`(${users.username} ilike ${'%' + term + '%'} or ${users.displayName} ilike ${'%' + term + '%'})`
      : sql`true`,
  );
  const rows = await memberJoin().where(where).orderBy(desc(users.createdAt)).limit(Math.min(options.limit ?? 60, 100));
  return rows.map((row) => projectMember(row, viewerId));
}

export async function membersByIds(ids: string[], viewerId?: string | null): Promise<Map<string, MemberSummary>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const rows = await memberJoin().where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, projectMember(row, viewerId)]));
}

export function toMemberRows(rows: MemberRow[]): Map<string, MemberRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

// ═══════════════════════════════════════════════════════════════════════════
// The Commons
// ═══════════════════════════════════════════════════════════════════════════

export interface PostAttachmentView {
  fileId: string;
  displayName: string;
  contentType: string;
  byteSize: number;
  kind: string;
}

export interface PollView {
  id: string;
  question: string;
  multiSelect: boolean;
  closesAt: Date | null;
  totalVotes: number;
  options: Array<{ id: string; label: string; votes: number; selected: boolean }>;
  viewerVoted: boolean;
  /** True once results should be visible — after voting or after closing. */
  revealed: boolean;
}

export interface PostView {
  id: string;
  body: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  editedAt: Date | null;
  pinned: boolean;
  reactionCount: number;
  commentCount: number;
  repostCount: number;
  visibility: string;
  author: MemberSummary;
  attachments: PostAttachmentView[];
  poll: PollView | null;
  hashtags: string[];
  myReactions: string[];
  bookmarked: boolean;
  repostOf: { id: string; authorName: string; preview: string | null } | null;
}

export interface NetworkPostView {
  id: string;
  body: string | null;
  title: string;
  content: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  editedAt: Date | null;
  pinned: boolean;
  reactionCount: number;
  commentCount: number;
  repostCount: number;
  visibility: string;
  author: MemberSummary;
  attachments: PostAttachmentView[];
  poll: PollView | null;
  hashtags: string[];
  myReactions: string[];
  bookmarked: boolean;
  repostOf: { id: string; authorName: string; preview: string | null } | null;
}

export type FeedSort = 'recent' | 'active' | 'discussed';

export async function feed(options: {
  viewerId: string;
  sort?: FeedSort;
  topic?: string | null;
  authorId?: string | null;
  limit?: number;
  cursor?: Date | null;
  followingOnly?: boolean;
  postId?: string;
  bookmarkedOnly?: boolean;
  query?: string | null;
}): Promise<PostView[]> {
  const limit = Math.min(options.limit ?? 20, 40);
  const sort = options.sort ?? 'active';

  const orderBy =
    sort === 'discussed'
      ? [desc(postTable.commentCount), desc(postTable.lastActivityAt)]
      : sort === 'recent'
        ? [desc(postTable.createdAt)]
        : [desc(postTable.lastActivityAt)];

  // Visibility is part of the query, so an ineligible row is never loaded.
  const rows = await db
    .select({
      id: postTable.id,
      body: postTable.body,
      createdAt: postTable.createdAt,
      lastActivityAt: postTable.lastActivityAt,
      editedAt: postTable.editedAt,
      pinned: postTable.pinned,
      reactionCount: postTable.reactionCount,
      commentCount: postTable.commentCount,
      repostCount: postTable.repostCount,
      visibility: postTable.visibility,
      repostOfId: postTable.repostOfId,
      authorId: postTable.authorId,
    })
    .from(postTable)
    .innerJoin(users, eq(users.id, postTable.authorId))
    .where(
      and(
        eq(postTable.status, 'published'),
        isNull(postTable.removedAt),
        resourceVisibleToViewer(postTable.visibility, postTable.authorId, options.viewerId),
        isNull(users.removedAt),
        eq(users.status, 'active'),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${postTable.authorId})
             or (b.blocker_id = ${postTable.authorId} and b.blocked_id = ${options.viewerId})
        )`,
        options.postId ? eq(postTable.id, options.postId) : sql`true`,
        options.bookmarkedOnly
          ? sql`exists (
              select 1 from ${bookmarkTable} bm
              where bm.user_id = ${options.viewerId}
                and bm.target_type = 'post'
                and bm.target_id = ${postTable.id}
            )`
          : sql`true`,
        options.authorId ? eq(postTable.authorId, options.authorId) : sql`true`,
        options.query?.trim()
          ? ilike(postTable.body, `%${options.query.trim().slice(0, 100)}%`)
          : sql`true`,
        options.followingOnly
          ? sql`exists (
              select 1 from ${userFollows} uf
              where uf.follower_id = ${options.viewerId}
                and uf.followed_id = ${postTable.authorId}
            )`
          : sql`true`,
        options.topic
          ? sql`exists (
              select 1 from ${postHashtags} h
              where h.post_id = ${postTable.id} and h.tag = ${options.topic}
            )`
          : sql`true`,
        options.cursor ? lt(postTable.createdAt, options.cursor) : sql`true`,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit);

  if (rows.length === 0) return [];

  const postIds = rows.map((row) => row.id);
  const authorMap = await membersByIds(rows.map((row) => row.authorId), options.viewerId);

  const [attachmentRows, tagRows, reactionRows, pollRows, bookmarkRows] = await Promise.all([
    db
      .select({
        postId: postAttachments.postId,
        fileId: files.id,
        displayName: files.displayName,
        detectedMime: files.detectedMime,
        byteSize: files.byteSize,
        position: postAttachments.position,
      })
      .from(postAttachments)
      .innerJoin(files, eq(files.id, postAttachments.fileId))
      .where(
        and(
          inArray(postAttachments.postId, postIds),
          // Never expose quarantined, removed, or orphaned file metadata.
          eq(files.state, 'clean'),
          isNull(files.removedAt),
          sql`exists (select 1 from storage_objects so where so.id = ${files.storageObjectId} and so.removed_at is null)`,
        ),
      )
      .orderBy(asc(postAttachments.position)),

    db
      .select({ postId: postHashtags.postId, tag: postHashtags.tag })
      .from(postHashtags)
      .where(inArray(postHashtags.postId, postIds)),

    db
      .select({ targetId: reactions.targetId, kind: reactions.kind })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, 'post'),
          eq(reactions.userId, options.viewerId),
          inArray(reactions.targetId, postIds),
        ),
      ),

    // Polls and their options in one round trip.
    db
      .select({
        postId: sql<string>`${postTable.id}`,
        pollId: sql<string>`pl.id`,
        question: sql<string>`pl.question`,
        multiSelect: sql<boolean>`pl.multi_select`,
        closesAt: sql<Date | null>`pl.closes_at`,
        optionId: sql<string | null>`po.id`,
        optionLabel: sql<string | null>`po.label`,
        optionVotes: sql<number | null>`po.votes`,
        viewerPicked: sql<boolean>`exists (
          select 1 from poll_votes pv
          where pv.poll_id = pl.id and pv.user_id = ${options.viewerId}
        )`,
        optionSelected: sql<boolean>`exists (
          select 1 from poll_votes pv
          where pv.poll_id = pl.id and pv.option_id = po.id and pv.user_id = ${options.viewerId}
        )`,
      })
      .from(postTable)
      .innerJoin(sql`polls pl on pl.post_id = ${postTable.id}`, sql`true`)
      .leftJoin(sql`poll_options po on po.poll_id = pl.id`, sql`true`)
      .where(inArray(postTable.id, postIds)),

    db
      .select({ targetId: bookmarkTable.targetId })
      .from(bookmarkTable)
      .where(and(
        eq(bookmarkTable.userId, options.viewerId),
        eq(bookmarkTable.targetType, 'post'),
        inArray(bookmarkTable.targetId, postIds),
      )),
  ]);

  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');
  const bookmarkedIds = new Set(bookmarkRows.map((row) => row.targetId));
  const tagsByPost = groupStrings(tagRows, 'postId', 'tag');

  const attachmentsByPost = new Map<string, PostAttachmentView[]>();
  for (const row of attachmentRows) {
    const list = attachmentsByPost.get(row.postId) ?? [];
    list.push({
      fileId: row.fileId,
      displayName: row.displayName,
      contentType: row.detectedMime ?? 'application/octet-stream',
      byteSize: row.byteSize,
      kind: (row.detectedMime ?? 'application/octet-stream').split('/')[0] ?? 'file',
    });
    attachmentsByPost.set(row.postId, list);
  }

  const pollsByPost = new Map<string, PollView>();
  for (const row of pollRows) {
    const existing = pollsByPost.get(row.postId);
    const poll: PollView =
      existing ?? {
        id: row.pollId,
        question: row.question,
        multiSelect: row.multiSelect,
        closesAt: row.closesAt,
        totalVotes: 0,
        options: [],
        viewerVoted: row.viewerPicked,
        revealed: row.viewerPicked || closed(row.closesAt),
      };

    if (row.optionId && row.optionLabel) {
      const votes = Number(row.optionVotes ?? 0);
      poll.options.push({ id: row.optionId, label: row.optionLabel, votes, selected: row.optionSelected });
      poll.totalVotes += votes;
    }
    pollsByPost.set(row.postId, poll);
  }

  const repostIds = rows.map((row) => row.repostOfId).filter((id): id is string => Boolean(id));
  const originals = repostIds.length
    ? await db
        .select({
          id: postTable.id,
          preview: sql<string | null>`left(${postTable.body}, 200)`,
          displayName: users.displayName,
        })
        .from(postTable)
        .innerJoin(users, eq(users.id, postTable.authorId))
        .where(and(
          inArray(postTable.id, repostIds),
          eq(postTable.status, 'published'),
          isNull(postTable.removedAt),
          resourceVisibleToViewer(postTable.visibility, postTable.authorId, options.viewerId),
          eq(users.status, 'active'),
          isNull(users.removedAt),
          sql`not exists (
            select 1 from ${blocks} b
            where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${postTable.authorId})
               or (b.blocker_id = ${postTable.authorId} and b.blocked_id = ${options.viewerId})
          )`,
        ))
    : [];
  const originalMap = new Map(originals.map((row) => [row.id, row]));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    editedAt: row.editedAt,
    pinned: row.pinned,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    repostCount: row.repostCount,
    visibility: row.visibility,
    author: authorMap.get(row.authorId)!,
    attachments: attachmentsByPost.get(row.id) ?? [],
    poll: pollsByPost.get(row.id) ?? null,
    hashtags: tagsByPost.get(row.id) ?? [],
    myReactions: myReactions.get(row.id) ?? [],
    bookmarked: bookmarkedIds.has(row.id),
    repostOf: row.repostOfId
      ? (() => {
          const original = originalMap.get(row.repostOfId);
          return {
            id: row.repostOfId,
            authorName: original?.displayName ?? '',
            preview: original?.preview ?? null,
          };
        })()
      : null,
  }));
}

export type SavedNonPostView = {
  targetType: 'archive_object' | 'game' | 'gallery_post';
  targetId: string;
  title: string;
  href: string;
  createdAt: Date;
};

/** Return only saved items that the member can still legitimately view. */
export async function savedNonPostItems(viewerId: string): Promise<SavedNonPostView[]> {
  const [archives, arcadeGames, galleryPieces] = await Promise.all([
    db.select({
      targetId: bookmarkTable.targetId,
      title: archiveObjectTable.title,
      slug: archiveObjectTable.slug,
      createdAt: bookmarkTable.createdAt,
    })
      .from(bookmarkTable)
      .innerJoin(archiveObjectTable, eq(archiveObjectTable.id, bookmarkTable.targetId))
      .where(and(
        eq(bookmarkTable.userId, viewerId),
        eq(bookmarkTable.targetType, 'archive_object'),
        resourceVisibleToViewer(archiveObjectTable.visibility, archiveObjectTable.contributorId, viewerId),
        isNull(archiveObjectTable.removedAt),
        sql`(${archiveObjectTable.contributorId} is null or exists (
          select 1 from users u
          where u.id = ${archiveObjectTable.contributorId}
            and u.status = 'active' and u.removed_at is null
        ))`,
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${archiveObjectTable.contributorId})
             or (b.blocker_id = ${archiveObjectTable.contributorId} and b.blocked_id = ${viewerId})
        )`,
      ))
      .orderBy(desc(bookmarkTable.createdAt))
      .limit(40),
    db.select({
      targetId: bookmarkTable.targetId,
      title: gameTable.title,
      slug: gameTable.slug,
      createdAt: bookmarkTable.createdAt,
    })
      .from(bookmarkTable)
      .innerJoin(gameTable, eq(gameTable.id, bookmarkTable.targetId))
      .where(and(
        eq(bookmarkTable.userId, viewerId),
        eq(bookmarkTable.targetType, 'game'),
        eq(gameTable.status, 'approved'),
        isNull(gameTable.removedAt),
        sql`exists (
          select 1 from users u where u.id = ${gameTable.creatorId}
            and u.status = 'active' and u.removed_at is null
        )`,
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${gameTable.creatorId})
             or (b.blocker_id = ${gameTable.creatorId} and b.blocked_id = ${viewerId})
        )`,
      ))
      .orderBy(desc(bookmarkTable.createdAt))
      .limit(40),
    db.select({
      targetId: bookmarkTable.targetId,
      title: galleryPostTable.title,
      slug: galleryPostTable.slug,
      createdAt: bookmarkTable.createdAt,
    })
      .from(bookmarkTable)
      .innerJoin(galleryPostTable, eq(galleryPostTable.id, bookmarkTable.targetId))
      .where(and(
        eq(bookmarkTable.userId, viewerId),
        eq(bookmarkTable.targetType, 'gallery_post'),
        resourceVisibleToViewer(galleryPostTable.visibility, galleryPostTable.authorId, viewerId),
        isNull(galleryPostTable.removedAt),
        sql`exists (
          select 1 from users u where u.id = ${galleryPostTable.authorId}
            and u.status = 'active' and u.removed_at is null
        )`,
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${galleryPostTable.authorId})
             or (b.blocker_id = ${galleryPostTable.authorId} and b.blocked_id = ${viewerId})
        )`,
      ))
      .orderBy(desc(bookmarkTable.createdAt))
      .limit(40),
  ]);

  return [
    ...archives.map((item) => ({ ...item, targetType: 'archive_object' as const, href: `/archive/${item.slug}` })),
    ...arcadeGames.map((item) => ({ ...item, targetType: 'game' as const, href: `/arcade/${item.slug}` })),
    ...galleryPieces.map((item) => ({ ...item, targetType: 'gallery_post' as const, href: `/gallery/${item.slug}` })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80);
}

export async function isBookmarked(
  viewerId: string,
  targetType: 'post' | 'archive_object' | 'game' | 'gallery_post',
  targetId: string,
): Promise<boolean> {
  const [row] = await db.select({ targetId: bookmarkTable.targetId })
    .from(bookmarkTable)
    .where(and(
      eq(bookmarkTable.userId, viewerId),
      eq(bookmarkTable.targetType, targetType),
      eq(bookmarkTable.targetId, targetId),
    ))
    .limit(1);
  return Boolean(row);
}

export async function postById(postId: string, viewerId: string): Promise<PostView | null> {
  // Use the feed's viewer-aware projection so detail pages preserve poll state
  // and the same visibility, block, and attachment rules as the main feed.
  const rows = await feed({ viewerId, postId, limit: 1 });
  return rows[0] ?? null;
}

export async function networkBySlug(slug: string, viewerId: string): Promise<NetworkPostView | null> {
  const post = await postById(slug, viewerId);
  if (!post) return null;
  const body = post.body ?? '';
  const title = (body.split('\n')[0] ?? '').trim();
  return {
    ...post,
    title,
    content: post.body,
  };
}

export { postComments as networkComments };
export { feed as networkFeed };
export { trendingTopics as trendingTags };

export async function projectPosts(
  rows: Array<{
    id: string;
    body: string | null;
    createdAt: Date;
    lastActivityAt: Date;
    editedAt: Date | null;
    pinned: boolean;
    reactionCount: number;
    commentCount: number;
    repostCount: number;
    visibility: string;
    repostOfId: string | null;
    authorId: string;
  }>,
  viewerId: string,
): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const postIds = rows.map((row) => row.id);
  const authorMap = await membersByIds(rows.map((row) => row.authorId), viewerId);

  const [attachmentRows, tagRows, reactionRows, bookmarkRows] = await Promise.all([
    db
      .select({
        postId: postAttachments.postId,
        fileId: files.id,
        displayName: files.displayName,
        detectedMime: files.detectedMime,
        byteSize: files.byteSize,
      })
      .from(postAttachments)
      .innerJoin(files, eq(files.id, postAttachments.fileId))
      .where(and(inArray(postAttachments.postId, postIds), eq(files.state, 'clean'), isNull(files.removedAt), sql`exists (select 1 from storage_objects so where so.id = ${files.storageObjectId} and so.removed_at is null)`)),
    db
      .select({ postId: postHashtags.postId, tag: postHashtags.tag })
      .from(postHashtags)
      .where(inArray(postHashtags.postId, postIds)),
    db
      .select({ targetId: reactions.targetId, kind: reactions.kind })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, 'post'),
          eq(reactions.userId, viewerId),
          inArray(reactions.targetId, postIds),
        ),
      ),
    db
      .select({ targetId: bookmarkTable.targetId })
      .from(bookmarkTable)
      .where(and(
        eq(bookmarkTable.userId, viewerId),
        eq(bookmarkTable.targetType, 'post'),
        inArray(bookmarkTable.targetId, postIds),
      )),
  ]);

  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');
  const bookmarkedIds = new Set(bookmarkRows.map((row) => row.targetId));
  const tagsByPost = groupStrings(tagRows, 'postId', 'tag');

  const attachmentsByPost = new Map<string, PostAttachmentView[]>();
  for (const row of attachmentRows) {
    const list = attachmentsByPost.get(row.postId) ?? [];
    list.push({
      fileId: row.fileId,
      displayName: row.displayName,
      contentType: row.detectedMime ?? 'application/octet-stream',
      byteSize: row.byteSize,
      kind: (row.detectedMime ?? 'application/octet-stream').split('/')[0] ?? 'file',
    });
    attachmentsByPost.set(row.postId, list);
  }

  const repostIds = rows.map((row) => row.repostOfId).filter((id): id is string => Boolean(id));
  const originals = repostIds.length
    ? await db
        .select({
          id: postTable.id,
          preview: sql<string | null>`left(${postTable.body}, 200)`,
          displayName: users.displayName,
        })
        .from(postTable)
        .innerJoin(users, eq(users.id, postTable.authorId))
        .where(and(
          inArray(postTable.id, repostIds),
          eq(postTable.status, 'published'),
          isNull(postTable.removedAt),
          resourceVisibleToViewer(postTable.visibility, postTable.authorId, viewerId),
          eq(users.status, 'active'),
          isNull(users.removedAt),
          sql`not exists (
            select 1 from ${blocks} b
            where (b.blocker_id = ${viewerId} and b.blocked_id = ${postTable.authorId})
               or (b.blocker_id = ${postTable.authorId} and b.blocked_id = ${viewerId})
          )`,
        ))
    : [];
  const originalMap = new Map(originals.map((row) => [row.id, row]));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    editedAt: row.editedAt,
    pinned: row.pinned,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    repostCount: row.repostCount,
    visibility: row.visibility,
    author: authorMap.get(row.authorId)!,
    attachments: attachmentsByPost.get(row.id) ?? [],
    poll: null,
    hashtags: tagsByPost.get(row.id) ?? [],
    myReactions: myReactions.get(row.id) ?? [],
    bookmarked: bookmarkedIds.has(row.id),
    repostOf: row.repostOfId
      ? {
          id: row.repostOfId,
          authorName: originalMap.get(row.repostOfId)?.displayName ?? '',
          preview: originalMap.get(row.repostOfId)?.preview ?? null,
        }
      : null,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Comments
// ═══════════════════════════════════════════════════════════════════════════

export interface CommentView {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  parentId: string | null;
  depth: number;
  author: MemberSummary;
  myReactions: string[];
  reactionCount: number;
  isMine: boolean;
}

export async function postComments(postId: string, viewerId: string): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: commentTable.id,
      body: commentTable.body,
      createdAt: commentTable.createdAt,
      editedAt: commentTable.editedAt,
      parentId: commentTable.parentId,
      authorId: commentTable.authorId,
      reactionCount: commentTable.reactionCount,
      status: commentTable.status,
    })
    .from(commentTable)
    .innerJoin(users, eq(users.id, commentTable.authorId))
    .where(
      and(
        eq(commentTable.postId, postId),
        inArray(commentTable.status, ['published', 'hidden']),
        isNull(commentTable.removedAt),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${commentTable.authorId})
             or (b.blocker_id = ${commentTable.authorId} and b.blocked_id = ${viewerId})
        )`,
      ),
    )
    .orderBy(asc(commentTable.createdAt))
    .limit(300);

  if (rows.length === 0) return [];

  const authorMap = await membersByIds(rows.map((row) => row.authorId), viewerId);

  const reactionRows = await db
    .select({ targetId: reactions.targetId, kind: reactions.kind })
    .from(reactions)
    .where(
      and(
        eq(reactions.targetType, 'comment'),
        eq(reactions.userId, viewerId),
        inArray(reactions.targetId, rows.map((row) => row.id)),
      ),
    );
  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');

  // Thread depth from the parent chain, bounded so a malformed graph cannot
  // make the client recurse without limit.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const depthOf = (row: (typeof rows)[number]): number => {
    let depth = 0;
    let cursor = row.parentId;
    const seen = new Set<string>();
    while (cursor && depth < 6 && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
      depth += 1;
    }
    return depth;
  };

  return rows.map((row) => ({
    id: row.id,
    // A hidden comment's text is not exposed, only its existence.
    body: row.status === 'hidden' ? 'This comment is hidden pending review.' : row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    parentId: row.parentId,
    depth: depthOf(row),
    author: authorMap.get(row.authorId)!,
    myReactions: myReactions.get(row.id) ?? [],
    reactionCount: row.reactionCount,
    isMine: row.authorId === viewerId,
  }));
}

export async function commentsByUser(userId: string, viewerId: string, limit = 40): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: commentTable.id,
      body: commentTable.body,
      createdAt: commentTable.createdAt,
      editedAt: commentTable.editedAt,
      parentId: commentTable.parentId,
      authorId: commentTable.authorId,
      reactionCount: commentTable.reactionCount,
      status: commentTable.status,
      postId: postTable.id,
    })
    .from(commentTable)
    .innerJoin(postTable, eq(postTable.id, commentTable.postId))
    .where(
      and(
        eq(commentTable.authorId, userId),
        eq(commentTable.status, 'published'),
        isNull(commentTable.removedAt),
        eq(postTable.status, 'published'),
        isNull(postTable.removedAt),
        resourceVisibleToViewer(postTable.visibility, postTable.authorId, viewerId),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${commentTable.authorId})
             or (b.blocker_id = ${commentTable.authorId} and b.blocked_id = ${viewerId})
             or (b.blocker_id = ${viewerId} and b.blocked_id = ${postTable.authorId})
             or (b.blocker_id = ${postTable.authorId} and b.blocked_id = ${viewerId})
        )`,
      ),
    )
    .orderBy(desc(commentTable.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];
  const authorMap = await membersByIds([userId], viewerId);
  const member = authorMap.get(userId)!;

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    parentId: row.parentId,
    depth: 0,
    author: member,
    myReactions: [],
    reactionCount: row.reactionCount,
    isMine: userId === viewerId,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Topics
// ═══════════════════════════════════════════════════════════════════════════

export interface TopicSummary {
  tag: string;
  useCount: number;
}

export async function trendingTopics(limit = 14): Promise<TopicSummary[]> {
  return db
    .select({ tag: hashtags.tag, useCount: hashtags.useCount })
    .from(hashtags)
    .orderBy(desc(hashtags.useCount))
    .limit(limit);
}

// ═══════════════════════════════════════════════════════════════════════════
// The Archive
// ═══════════════════════════════════════════════════════════════════════════

export interface ArchiveView {
  id: string;
  catalogueNumber: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  license: string;
  attribution: string | null;
  featured: boolean;
  downloadCount: number;
  reactionCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: Date;
  contributor: MemberSummary | null;
  file: {
    id: string;
    displayName: string;
    contentType: string;
    byteSize: number;
  } | null;
  tags: string[];
  myReactions: string[];
  visibility: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  knowledge: 'Knowledge',
  student_resources: 'Student Resources',
  games: 'Games',
  music: 'Music',
  art: 'Art',
  photography: 'Photography',
  videos: 'Videos',
  documents: 'Documents',
  interesting_things: 'Interesting Things',
  web_discoveries: 'Web Discoveries',
  member_creations: 'Member Creations',
};

export type ArchiveSort = 'recent' | 'discussed' | 'popular' | 'catalogue';

export async function archiveObjects(options: {
  viewerId: string;
  category?: string | null;
  tag?: string | null;
  contributorId?: string | null;
  query?: string | null;
  sort?: ArchiveSort;
  limit?: number;
  offset?: number;
}): Promise<ArchiveView[]> {
  const limit = Math.min(options.limit ?? 24, 60);
  const offset = Math.max(0, options.offset ?? 0);

  const orderBy =
    options.sort === 'popular'
      ? [desc(archiveObjectTable.downloadCount), desc(archiveObjectTable.createdAt)]
      : options.sort === 'discussed'
        ? [desc(archiveObjectTable.commentCount), desc(archiveObjectTable.createdAt)]
        : options.sort === 'catalogue'
          ? [desc(archiveObjectTable.catalogueNumber)]
          : [desc(archiveObjectTable.createdAt)];

  const rows = await db
    .select({
      id: archiveObjectTable.id,
      catalogueNumber: archiveObjectTable.catalogueNumber,
      slug: archiveObjectTable.slug,
      title: archiveObjectTable.title,
      description: archiveObjectTable.description,
      category: archiveObjectTable.category,
      license: archiveObjectTable.license,
      attribution: archiveObjectTable.attribution,
      featured: archiveObjectTable.featured,
      downloadCount: archiveObjectTable.downloadCount,
      reactionCount: archiveObjectTable.reactionCount,
      commentCount: archiveObjectTable.commentCount,
      viewCount: archiveObjectTable.viewCount,
      createdAt: archiveObjectTable.createdAt,
      visibility: archiveObjectTable.visibility,
      contributorId: archiveObjectTable.contributorId,
      fileId: files.id,
      fileName: files.displayName,
      fileMime: files.detectedMime,
      fileSize: files.byteSize,
    })
    .from(archiveObjectTable)
    .leftJoin(files, eq(files.id, archiveObjectTable.fileId))
    .where(
      and(
        isNull(archiveObjectTable.removedAt),
        resourceVisibleToViewer(archiveObjectTable.visibility, archiveObjectTable.contributorId, options.viewerId),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${archiveObjectTable.contributorId})
             or (b.blocker_id = ${archiveObjectTable.contributorId} and b.blocked_id = ${options.viewerId})
        )`,
        // An object whose file failed scanning is not listed.
        sql`${archiveObjectTable.fileId} is null or ${files.state} = 'clean'`,
        options.category ? eq(archiveObjectTable.category, options.category as never) : sql`true`,
        options.contributorId
          ? eq(archiveObjectTable.contributorId, options.contributorId)
          : sql`true`,
        options.query
          ? sql`(${archiveObjectTable.title} ilike ${`%${options.query}%`}
                   or ${archiveObjectTable.description} ilike ${`%${options.query}%`})`
          : sql`true`,
        options.tag
          ? sql`exists (
              select 1 from ${archiveObjectTags} t
              where t.object_id = ${archiveObjectTable.id} and t.tag = ${options.tag}
            )`
          : sql`true`,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  const contributorIds = rows
    .map((row) => row.contributorId)
    .filter((id): id is string => Boolean(id));
  const contributorMap = await membersByIds(contributorIds, options.viewerId);

  const tagRows = await db
    .select({ objectId: archiveObjectTags.objectId, tag: archiveObjectTags.tag })
    .from(archiveObjectTags)
    .where(inArray(archiveObjectTags.objectId, rows.map((row) => row.id)));
  const tagsByObject = groupStrings(tagRows, 'objectId', 'tag');

  const reactionRows = await db
    .select({ targetId: reactions.targetId, kind: reactions.kind })
    .from(reactions)
    .where(
      and(
        eq(reactions.targetType, 'archive_object'),
        eq(reactions.userId, options.viewerId),
        inArray(reactions.targetId, rows.map((row) => row.id)),
      ),
    );
  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');

  return rows.map((row) => ({
    id: row.id,
    catalogueNumber: `ARC-${String(row.catalogueNumber).padStart(6, '0')}`,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
    license: row.license,
    attribution: row.attribution,
    featured: row.featured,
    downloadCount: row.downloadCount,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
    visibility: row.visibility,
    contributor: row.contributorId ? (contributorMap.get(row.contributorId) ?? null) : null,
    file: row.fileId
      ? {
          id: row.fileId,
          displayName: row.fileName ?? 'file',
          contentType: row.fileMime ?? 'application/octet-stream',
          byteSize: row.fileSize ?? 0,
        }
      : null,
    tags: tagsByObject.get(row.id) ?? [],
    myReactions: myReactions.get(row.id) ?? [],
  }));
}

export async function archiveBySlug(slug: string, viewerId: string): Promise<ArchiveView | null> {
  const [row] = await db
    .select({ id: archiveObjectTable.id })
    .from(archiveObjectTable)
    .where(and(eq(archiveObjectTable.slug, slug), isNull(archiveObjectTable.removedAt)))
    .limit(1);
  if (!row) return null;

  const batch = await archiveObjects({ viewerId, limit: 60 });
  return batch.find((object) => object.id === row.id) ?? null;
}

export interface CollectionView {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  itemCount: number;
  featured: boolean;
  coverObjectId: string | null;
  curatorId: string | null;
  createdAt: Date;
}

export async function collections(options: { featuredOnly?: boolean; limit?: number } = {}): Promise<CollectionView[]> {
  const rows = await db
    .select({
      id: collectionTable.id,
      slug: collectionTable.slug,
      title: collectionTable.title,
      blurb: collectionTable.blurb,
      itemCount: collectionTable.itemCount,
      featured: collectionTable.featured,
      coverObjectId: collectionTable.coverObjectId,
      curatorId: collectionTable.curatorId,
      createdAt: collectionTable.createdAt,
    })
    .from(collectionTable)
    .where(options.featuredOnly ? eq(collectionTable.featured, true) : sql`true`)
    .orderBy(desc(collectionTable.featured), desc(collectionTable.updatedAt))
    .limit(options.limit ?? 12);

  return rows;
}

export async function collectionBySlug(slug: string): Promise<CollectionView | null> {
  const [row] = await db
    .select()
    .from(collectionTable)
    .where(eq(collectionTable.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    blurb: row.blurb,
    itemCount: row.itemCount,
    featured: row.featured,
    coverObjectId: row.coverObjectId,
    curatorId: row.curatorId,
    createdAt: row.createdAt,
  };
}

/**
 * Resolves a collection's contents in the right order.
 *
 * Paging is done here rather than in SQL so the ordering is authoritative and a
 * stale `itemCount` cannot truncate the list.
 */
export async function collectionContents(
  collectionId: string,
  viewerId: string,
  offset = 0,
  limit = 24,
): Promise<Array<ArchiveView & { note: string | null; position: number }>> {
  const items = await db
    .select({
      objectId: collectionItemTable.archiveObjectId,
      position: collectionItemTable.position,
      note: collectionItemTable.note,
    })
    .from(collectionItemTable)
    .innerJoin(archiveObjectTable, eq(archiveObjectTable.id, collectionItemTable.archiveObjectId))
    .where(
      and(
        eq(collectionItemTable.collectionId, collectionId),
        isNull(archiveObjectTable.removedAt),
        inArray(archiveObjectTable.visibility, ['members', 'public']),
      ),
    )
    .orderBy(asc(collectionItemTable.position))
    .offset(offset)
    .limit(limit);

  if (items.length === 0) return [];

  const views = await archiveObjects({ viewerId, limit: 60 });
  const byId = new Map(views.map((view) => [view.id, view]));

  return items
    .map((item) => {
      const view = byId.get(item.objectId);
      return view ? { ...view, note: item.note, position: item.position } : null;
    })
    .filter((item): item is ArchiveView & { note: string | null; position: number } => item !== null);
}

export async function archiveComments(objectId: string, viewerId: string) {
  const rows = await db
    .select({
      id: sql<string>`ac.id`,
      body: sql<string>`ac.body`,
      createdAt: sql<Date>`ac.created_at`,
      status: sql<string>`ac.status`,
      authorId: users.id,
    })
    .from(sql`archive_comments ac`)
    .innerJoin(users, eq(users.id, sql`ac.author_id`))
    .where(sql`ac.object_id = ${objectId} and ac.status = 'published' and ac.removed_at is null`)
    .orderBy(asc(sql`ac.created_at`))
    .limit(100);

  if (rows.length === 0) return [];
  const authorMap = await membersByIds([viewerId], viewerId);
  void authorMap;

  const authors = await membersByIds(rows.map((row) => row.authorId), viewerId);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: authors.get(row.authorId)!,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// The Arcade
// ═══════════════════════════════════════════════════════════════════════════

export interface GameView {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  genre: string;
  controls: string;
  status: string;
  playCount: number;
  rating: number;
  ratingCount: number;
  commentCount: number;
  createdAt: Date;
  creator: MemberSummary;
  tags: string[];
  findingCount: number;
  myStars: number | null;
}

export async function arcadeGames(options: {
  viewerId: string | null;
  genre?: string | null;
  query?: string | null;
  sort?: 'popular' | 'recent' | 'rating';
  limit?: number;
  includeUnapproved?: boolean;
  creatorId?: string | null;
  slug?: string | null;
}): Promise<GameView[]> {
  const limit = Math.min(options.limit ?? 24, 60);

  const orderBy =
    options.sort === 'recent'
      ? [desc(gameTable.createdAt)]
      : options.sort === 'rating'
        ? [
            desc(
              sql`case when ${gameTable.ratingCount} > 0
                   then ${gameTable.ratingSum}::float / ${gameTable.ratingCount}
                   else 0 end`,
            ),
          ]
        : [desc(gameTable.playCount), desc(gameTable.createdAt)];

  const rows = await db
    .select({
      id: gameTable.id,
      slug: gameTable.slug,
      title: gameTable.title,
      tagline: gameTable.tagline,
      description: gameTable.description,
      genre: gameTable.genre,
      controls: gameTable.controls,
      status: gameTable.status,
      playCount: gameTable.playCount,
      ratingSum: gameTable.ratingSum,
      ratingCount: gameTable.ratingCount,
      commentCount: gameTable.commentCount,
      createdAt: gameTable.createdAt,
      creatorId: gameTable.creatorId,
      findingCount: sql<number>`coalesce(jsonb_array_length(${gameTable.scanReport}->'findings'), 0)`,
    })
    .from(gameTable)
    .innerJoin(users, eq(users.id, gameTable.creatorId))
    .where(
      and(
        isNull(gameTable.removedAt),
        eq(users.status, 'active'),
        isNull(users.removedAt),
        options.viewerId ? sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${gameTable.creatorId})
             or (b.blocker_id = ${gameTable.creatorId} and b.blocked_id = ${options.viewerId})
        )` : sql`true`,
        options.includeUnapproved ? sql`true` : eq(gameTable.status, 'approved'),
        options.genre ? eq(gameTable.genre, options.genre) : sql`true`,
        options.creatorId ? eq(gameTable.creatorId, options.creatorId) : sql`true`,
        options.slug ? eq(gameTable.slug, options.slug) : sql`true`,
        options.query
          ? sql`(${gameTable.title} ilike ${`%${options.query}%`}
                   or ${gameTable.tagline} ilike ${`%${options.query}%`})`
          : sql`true`,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit);

  if (rows.length === 0) return [];

  const creatorMap = await membersByIds(rows.map((row) => row.creatorId), options.viewerId);

  const tagRows = await db
    .select({ gameId: sql<string>`game_tags.game_id`, tag: sql<string>`game_tags.tag` })
    .from(sql`game_tags`)
    .where(sql`game_tags.game_id in ${rows.map((row) => row.id)}`)
    .orderBy(asc(sql`game_tags.tag`));
  const tagsByGame = groupStrings(tagRows, 'gameId', 'tag');

  const myRatings = options.viewerId
    ? await db
        .select({
          gameId: sql<string>`game_ratings.game_id`,
          stars: sql<number>`game_ratings.stars`,
        })
        .from(sql`game_ratings`)
        .where(
          sql`game_ratings.game_id in ${rows.map((row) => row.id)}
              and game_ratings.user_id = ${options.viewerId}`,
        )
    : [];
  const ratingMap = new Map(myRatings.map((row) => [row.gameId, Number(row.stars)]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    genre: row.genre,
    controls: row.controls,
    status: row.status,
    playCount: row.playCount,
    rating: row.ratingCount > 0 ? row.ratingSum / row.ratingCount : 0,
    ratingCount: row.ratingCount,
    commentCount: row.commentCount,
    createdAt: row.createdAt,
    creator: creatorMap.get(row.creatorId)!,
    tags: tagsByGame.get(row.id) ?? [],
    findingCount: row.findingCount,
    myStars: ratingMap.get(row.id) ?? null,
  }));
}

export async function gameBySlug(slug: string, viewerId: string | null): Promise<GameView | null> {
  const [game] = await arcadeGames({
    viewerId,
    includeUnapproved: true,
    limit: 1,
    slug,
  });
  if (!game) return null;

  // Unapproved games are only visible to their creator.
  if (game.status !== 'approved' && game.creator.userId !== viewerId) return null;
  return game;
}

// ══════════════════════════════════════════════════════════════════════════════
// The Arcade (continued)
// ══════════════════════════════════════════════════════════════════════════════

export interface GameCommentView {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  parentId: string | null;
  depth: number;
  author: MemberSummary;
  myReactions: string[];
  reactionCount: number;
  isMine: boolean;
}

export async function getGameComments(gameId: string, viewerId: string): Promise<GameCommentView[]> {
  const rows = await db
    .select({
      id: gameComments.id,
      body: gameComments.body,
      createdAt: gameComments.createdAt,
      editedAt: gameComments.editedAt,
      parentId: gameComments.parentId,
      authorId: gameComments.authorId,
      reactionCount: gameComments.reactionCount,
      status: gameComments.status,
    })
    .from(gameComments)
    .innerJoin(users, eq(users.id, gameComments.authorId))
    .where(
      and(
        eq(gameComments.gameId, gameId),
        inArray(gameComments.status, ['published', 'hidden']),
        isNull(gameComments.removedAt),
      ),
    )
    .orderBy(asc(gameComments.createdAt))
    .limit(300);

  if (rows.length === 0) return [];

  const authorMap = await membersByIds(rows.map((row) => row.authorId), viewerId);

  const reactionRows = await db
    .select({ targetId: reactions.targetId, kind: reactions.kind })
    .from(reactions)
    .where(
      and(
        eq(reactions.targetType, 'game_comment'),
        eq(reactions.userId, viewerId),
        inArray(reactions.targetId, rows.map((row) => row.id)),
      ),
    );
  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');

  // Thread depth from the parent chain, bounded so a malformed graph cannot
  // make the client recurse without limit.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const depthOf = (row: (typeof rows)[number]): number => {
    let depth = 0;
    let cursor = row.parentId;
    const seen = new Set<string>();
    while (cursor && depth < 6 && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
      depth += 1;
    }
    return depth;
  };

  return rows.map((row) => ({
    id: row.id,
    // A hidden comment's text is not exposed, only its existence.
    body: row.status === 'hidden' ? 'This comment is hidden pending review.' : row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    parentId: row.parentId,
    depth: depthOf(row),
    author: authorMap.get(row.authorId)!,
    myReactions: myReactions.get(row.id) ?? [],
    reactionCount: row.reactionCount,
    isMine: row.authorId === viewerId,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// The Gallery
// ═══════════════════════════════════════════════════════════════════════════

export interface GalleryView {
  id: string;
  slug: string;
  title: string;
  caption: string;
  kind: string;
  body: string | null;
  createdAt: Date;
  reactionCount: number;
  commentCount: number;
  viewCount: number;
  author: MemberSummary;
  coverUrl: string | null;
  mediaCount: number;
  showInPortfolio: boolean;
  visibility: 'public' | 'members' | 'connections' | 'private';
  myReactions: string[];
}

export async function galleryPosts(options: {
  viewerId: string;
  kind?: string | null;
  authorId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<GalleryView[]> {
  const limit = Math.min(options.limit ?? 24, 48);

  const rows = await db
    .select({
      id: galleryPostTable.id,
      slug: galleryPostTable.slug,
      title: galleryPostTable.title,
      caption: galleryPostTable.caption,
      kind: galleryPostTable.kind,
      body: galleryPostTable.body,
      createdAt: galleryPostTable.createdAt,
      reactionCount: galleryPostTable.reactionCount,
      commentCount: galleryPostTable.commentCount,
      viewCount: galleryPostTable.viewCount,
      showInPortfolio: galleryPostTable.showInPortfolio,
      visibility: galleryPostTable.visibility,
      authorId: galleryPostTable.authorId,
      coverObjectId: galleryPostTable.coverObjectId,
      mediaCount: sql<number>`(
        select count(*)::int from ${galleryAttachments} where post_id = ${galleryPostTable.id}
      )`,
    })
    .from(galleryPostTable)
    .innerJoin(users, eq(users.id, galleryPostTable.authorId))
    .where(
      and(
        eq(galleryPostTable.status, 'published'),
        isNull(galleryPostTable.removedAt),
        resourceVisibleToViewer(galleryPostTable.visibility, galleryPostTable.authorId, options.viewerId),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${galleryPostTable.authorId})
             or (b.blocker_id = ${galleryPostTable.authorId} and b.blocked_id = ${options.viewerId})
        )`,
        options.kind ? eq(galleryPostTable.kind, options.kind as never) : sql`true`,
        options.authorId ? eq(galleryPostTable.authorId, options.authorId) : sql`true`,
      ),
    )
    .orderBy(desc(galleryPostTable.createdAt))
    .limit(limit)
    .offset(options.offset ?? 0);

  if (rows.length === 0) return [];

  const authorMap = await membersByIds(rows.map((row) => row.authorId), options.viewerId);

  const reactionRows = await db
    .select({ targetId: reactions.targetId, kind: reactions.kind })
    .from(reactions)
    .where(
      and(
        eq(reactions.targetType, 'gallery_post'),
        eq(reactions.userId, options.viewerId),
        inArray(reactions.targetId, rows.map((row) => row.id)),
      ),
    );
  const myReactions = groupStrings(reactionRows, 'targetId', 'kind');

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    caption: row.caption,
    kind: row.kind,
    body: row.body,
    createdAt: row.createdAt,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    viewCount: row.viewCount,
    showInPortfolio: row.showInPortfolio,
    visibility: row.visibility,
    mediaCount: row.mediaCount,
    coverUrl: row.coverObjectId ? `/objects/${row.coverObjectId}` : null,
    author: authorMap.get(row.authorId)!,
    myReactions: myReactions.get(row.id) ?? [],
  }));
}

export async function galleryBySlug(slug: string, viewerId: string): Promise<GalleryView | null> {
  const [row] = await db
    .select({ id: galleryPostTable.id })
    .from(galleryPostTable)
    .where(
      and(
        eq(galleryPostTable.slug, slug),
        eq(galleryPostTable.status, 'published'),
        isNull(galleryPostTable.removedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const batch = await galleryPosts({ viewerId, limit: 48, authorId: null });
  return batch.find((entry) => entry.id === row.id) ?? null;
}

export async function galleryMedia(slug: string) {
  const [post] = await db
    .select({ id: galleryPostTable.id })
    .from(galleryPostTable)
    .where(eq(galleryPostTable.slug, slug))
    .limit(1);
  if (!post) return [];

  return db
    .select({
      fileId: files.id,
      displayName: files.displayName,
      detectedMime: files.detectedMime,
      byteSize: files.byteSize,
      caption: galleryAttachments.caption,
      position: galleryAttachments.position,
    })
    .from(galleryAttachments)
    .innerJoin(files, eq(files.id, galleryAttachments.fileId))
    .where(and(eq(galleryAttachments.postId, post.id), eq(files.state, 'clean'), isNull(files.removedAt), sql`exists (select 1 from storage_objects so where so.id = ${files.storageObjectId} and so.removed_at is null)`))
    .orderBy(asc(galleryAttachments.position));
}

// ═══════════════════════════════════════════════════════════════════════════
// Cinema
// ═══════════════════════════════════════════════════════════════════════════

export interface CinemaFilmView {
  id: string;
  slug: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  cineStatus: string;
  runtimeMinutes: number | null;
  coverUrl: string | null;
  watchLinks: Array<{ service: string; url: string; note?: string }>;
  reviewCount: number;
  averageRating: number | null;
  inWatchlist: boolean;
}

export async function cinemaFilms(
  viewerId: string,
  options: { query?: string | null; slug?: string | null; limit?: number } = {},
): Promise<CinemaFilmView[]> {
  const term = (options.query ?? '').trim().slice(0, 80);
  const rows = await db
    .select({
      id: filmTable.id,
      slug: filmTable.slug,
      title: filmTable.title,
      year: filmTable.year,
      director: filmTable.director,
      synopsis: filmTable.synopsis,
      cineStatus: filmTable.cineStatus,
      runtimeMinutes: filmTable.runtimeMinutes,
      coverObjectId: filmTable.coverObjectId,
      watchLinks: filmTable.watchLinks,
      reviewCount: sql<number>`(select count(*)::int from ${filmReviews} r where r.film_id = ${filmTable.id} and r.removed_at is null)`,
      averageRating: sql<number | null>`(select avg(r.rating)::float from ${filmReviews} r where r.film_id = ${filmTable.id} and r.removed_at is null)`,
      inWatchlist: sql<boolean>`exists (
        select 1 from ${watchlists} w
        join ${watchlistItems} wi on wi.watchlist_id = w.id
        where w.user_id = ${viewerId} and wi.film_id = ${filmTable.id}
      )`,
    })
    .from(filmTable)
    .where(options.slug
      ? eq(filmTable.slug, options.slug)
      : term
        ? sql`(${filmTable.title} ilike ${'%' + term + '%'} or coalesce(${filmTable.director}, '') ilike ${'%' + term + '%'})`
        : sql`true`)
    .orderBy(desc(filmTable.createdAt))
    .limit(Math.min(options.limit ?? 60, 100));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    director: row.director,
    synopsis: row.synopsis,
    cineStatus: row.cineStatus,
    runtimeMinutes: row.runtimeMinutes,
    coverUrl: row.coverObjectId ? `/objects/${row.coverObjectId}` : null,
    watchLinks: row.watchLinks,
    reviewCount: row.reviewCount,
    averageRating: row.averageRating === null ? null : Number(row.averageRating),
    inWatchlist: row.inWatchlist,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════════════════

export interface EventView {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  attendingCount: number;
  interestedCount: number;
  capacity: number | null;
  coverUrl: string | null;
  host: MemberSummary;
  myRsvp: string | null;
  createdAt: Date;
}

export async function events(options: {
  viewerId: string;
  limit?: number;
  hostId?: string | null;
  past?: boolean;
  kind?: string | null;
}): Promise<EventView[]> {
  const limit = Math.min(options.limit ?? 12, 40);
  const now = new Date();

  const rows = await db
    .select({
      id: eventTable.id,
      slug: eventTable.slug,
      title: eventTable.title,
      description: eventTable.description,
      kind: eventTable.kind,
      startsAt: eventTable.startsAt,
      endsAt: eventTable.endsAt,
      location: eventTable.location,
      attendingCount: eventTable.attendingCount,
      interestedCount: eventTable.interestedCount,
      capacity: eventTable.capacity,
      coverObjectId: eventTable.coverObjectId,
      hostId: eventTable.hostId,
      createdAt: eventTable.createdAt,
      myRsvp: sql<string | null>`(
        select r.status from ${rsvps} r
        where r.event_id = ${eventTable.id} and r.user_id = ${options.viewerId}
      )`,
    })
    .from(eventTable)
    .innerJoin(users, eq(users.id, eventTable.hostId))
    .where(
      and(
        isNull(eventTable.removedAt),
        isNull(eventTable.cancelledAt),
        resourceVisibleToViewer(eventTable.visibility, eventTable.hostId, options.viewerId),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${options.viewerId} and b.blocked_id = ${eventTable.hostId})
             or (b.blocker_id = ${eventTable.hostId} and b.blocked_id = ${options.viewerId})
        )`,
        // Soon-started events stay visible for six hours of grace.
        options.past
          ? lt(eventTable.startsAt, now)
          : gt(eventTable.startsAt, new Date(now.getTime() - 6 * 60 * 60 * 1000)),
        options.hostId ? eq(eventTable.hostId, options.hostId) : sql`true`,
        options.kind ? eq(eventTable.kind, options.kind as never) : sql`true`,
      ),
    )
    .orderBy(options.past ? desc(eventTable.startsAt) : asc(eventTable.startsAt))
    .limit(limit);

  if (rows.length === 0) return [];
  const hostMap = await membersByIds(rows.map((row) => row.hostId), options.viewerId);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.location,
    attendingCount: row.attendingCount,
    interestedCount: row.interestedCount,
    capacity: row.capacity,
    coverUrl: row.coverObjectId ? `/objects/${row.coverObjectId}` : null,
    host: hostMap.get(row.hostId)!,
    myRsvp: row.myRsvp,
    createdAt: row.createdAt,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversations
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationSummary {
  id: string;
  kind: string;
  title: string;
  topic: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unread: number;
  mutedUntil: Date | null;
  memberCount: number;
  members: MemberSummary[];
  projectId: string | null;
  myRole: string;
}

export async function conversationList(viewerId: string): Promise<ConversationSummary[]> {
  const memberships = await db
    .select({
      conversationId: conversationMembers.conversationId,
      lastReadAt: conversationMembers.lastReadAt,
      mutedUntil: conversationMembers.mutedUntil,
      role: conversationMembers.role,
    })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, viewerId), isNull(conversationMembers.removedAt)));

  if (memberships.length === 0) return [];

  const conversationIds = memberships.map((row) => row.conversationId);
  const roleByConversation = new Map(memberships.map((row) => [row.conversationId, row.role]));
  const mutedByConversation = new Map(memberships.map((row) => [row.conversationId, row.mutedUntil]));

  const rows = await db
    .select({
      id: conversationTable.id,
      kind: conversationTable.kind,
      title: conversationTable.title,
      topic: conversationTable.topic,
      projectId: conversationTable.projectId,
      lastMessageAt: conversationTable.lastMessageAt,
      lastMessagePreview: conversationTable.lastMessagePreview,
    })
    .from(conversationTable)
    .where(and(
      inArray(conversationTable.id, conversationIds),
      isNull(conversationTable.removedAt),
    ))
    .orderBy(desc(sql`coalesce(${conversationTable.lastMessageAt}, ${conversationTable.createdAt})`));

  if (rows.length === 0) return [];

  const memberRows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      level: users.level,
      ageBand: users.ageBand,
      region: users.region,
      createdAt: users.createdAt,
      headline: profiles.headline,
      avatarObjectId: profiles.avatarObjectId,
      showRegion: userSettings.showRegion,
      hideAgeBand: userSettings.hideAgeBand,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(
        inArray(conversationMembers.conversationId, conversationIds),
        isNull(conversationMembers.removedAt),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ),
    );

  const membersByConversation = new Map<string, MemberSummary[]>();
  for (const row of memberRows) {
    const list = membersByConversation.get(row.conversationId) ?? [];
    list.push(projectMember(row, viewerId));
    membersByConversation.set(row.conversationId, list);
  }

  const unreadRows = await db
    .select({
      conversationId: messageTable.conversationId,
      count: sql<number>`count(*)::int`,
    })
    .from(messageTable)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messageTable.conversationId),
        eq(conversationMembers.userId, viewerId),
      ),
    )
    .where(
      and(
        inArray(messageTable.conversationId, conversationIds),
        isNull(conversationMembers.removedAt),
        sql`${messageTable.senderId} <> ${viewerId}`,
        isNull(messageTable.removedAt),
        sql`${messageTable.createdAt} > coalesce(${conversationMembers.lastReadAt}, to_timestamp(0))`,
      ),
    )
    .groupBy(messageTable.conversationId);
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row.count]));

  return rows.map((row) => {
    const members = membersByConversation.get(row.id) ?? [];
    const others = members.filter((member) => member.userId !== viewerId);
    const title =
      row.title ??
      (row.kind === 'direct'
        ? others.map((member) => member.displayName).join(', ') || 'Conversation'
        : `Group of ${members.length}`);

    return {
      id: row.id,
      kind: row.kind,
      title,
      topic: row.topic,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      unread: Number(unreadByConversation.get(row.id) ?? 0),
      mutedUntil: mutedByConversation.get(row.id) ?? null,
      memberCount: members.length,
      members,
      projectId: row.projectId,
      myRole: roleByConversation.get(row.id) ?? 'member',
    };
  });
}

export interface MessageView {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  sender: MemberSummary;
  isMine: boolean;
  attachment: {
    id: string;
    displayName: string;
    contentType: string;
    byteSize: number;
  } | null;
  removed: boolean;
  replyTo: { id: string; preview: string } | null;
}

/**
 * Loads a conversation's messages. Returns null when the viewer is not a
 * member — membership is the authorisation boundary, checked before any row is
 * read, so a non-member cannot infer whether a conversation exists.
 */
export async function conversationMessages(
  conversationId: string,
  viewerId: string,
): Promise<MessageView[] | null> {
  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .innerJoin(conversationTable, and(
      eq(conversationTable.id, conversationMembers.conversationId),
      isNull(conversationTable.removedAt),
    ))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, viewerId),
        isNull(conversationMembers.removedAt),
      ),
    )
    .limit(1);
  if (!membership[0]) return null;

  const rows = await db
    .select({
      id: messageTable.id,
      body: messageTable.body,
      createdAt: messageTable.createdAt,
      editedAt: messageTable.editedAt,
      senderId: messageTable.senderId,
      removedAt: messageTable.removedAt,
      replyToId: sql<string | null>`(select r.id::text from messages r where r.id = ${messageTable.replyToId} and r.conversation_id = ${conversationId} and r.removed_at is null limit 1)`,
      replyPreview: sql<string | null>`(select left(coalesce(nullif(r.body, ''), case when r.attachment_file_id is not null then 'Attachment' else 'Message' end), 160) from messages r where r.id = ${messageTable.replyToId} and r.conversation_id = ${conversationId} and r.removed_at is null limit 1)`,
      attachmentId: files.id,
      attachmentName: files.displayName,
      attachmentMime: files.detectedMime,
      attachmentSize: files.byteSize,
    })
    .from(messageTable)
    .innerJoin(users, eq(users.id, messageTable.senderId))
    .leftJoin(files, and(
      eq(files.id, messageTable.attachmentFileId),
      eq(files.state, 'clean'),
      isNull(files.removedAt),
      sql`exists (
        select 1 from storage_objects so
        where so.id = ${files.storageObjectId}
          and so.removed_at is null
      )`,
    ))
    .where(and(eq(messageTable.conversationId, conversationId), isNull(messageTable.removedAt)))
    .orderBy(desc(messageTable.createdAt))
    .limit(300);

  const senderMap = await membersByIds(rows.map((row) => row.senderId), viewerId);

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, viewerId),
        isNull(conversationMembers.removedAt),
      ),
    );

  // Fetch the newest page first, then render it chronologically.
  return [...rows].reverse().map((row) => ({
    id: row.id,
    body: row.removedAt ? '' : row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    removed: Boolean(row.removedAt),
    replyTo: row.replyToId && row.replyPreview !== null ? { id: row.replyToId, preview: row.replyPreview } : null,
    sender: senderMap.get(row.senderId)!,
    isMine: row.senderId === viewerId,
    attachment: row.attachmentId
      ? {
          id: row.attachmentId,
          displayName: row.attachmentName ?? 'file',
          contentType: row.attachmentMime ?? 'application/octet-stream',
          byteSize: row.attachmentSize ?? 0,
        }
      : null,
  }));
}

export async function conversationMembersOf(conversationId: string, viewerId: string) {
  const membership = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .innerJoin(conversationTable, and(
      eq(conversationTable.id, conversationMembers.conversationId),
      isNull(conversationTable.removedAt),
    ))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, viewerId),
        isNull(conversationMembers.removedAt),
      ),
    )
    .limit(1);
  if (!membership[0]) return null;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      memberId: users.memberId,
      level: users.level,
      ageBand: users.ageBand,
      region: users.region,
      createdAt: users.createdAt,
      headline: profiles.headline,
      avatarObjectId: profiles.avatarObjectId,
      showRegion: userSettings.showRegion,
      hideAgeBand: userSettings.hideAgeBand,
      role: conversationMembers.role,
      joinedAt: conversationMembers.joinedAt,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        isNull(conversationMembers.removedAt),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      ),
    );

  return rows.map((row) => ({
    ...projectMember(row, viewerId),
    role: row.role,
    joinedAt: row.joinedAt,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Projects
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  lifespan: string;
  status: string;
  taskCount: number;
  openTasks: number;
  createdAt: Date;
  endsAt: Date | null;
  owner: MemberSummary;
  memberCount: number;
  myRole: string | null;
  conversationId: string | null;
}

export async function projectList(viewerId: string, limit = 24): Promise<ProjectView[]> {
  const rows = await db
    .select({
      id: projectTable.id,
      slug: projectTable.slug,
      title: projectTable.title,
      summary: projectTable.summary,
      description: projectTable.description,
      lifespan: projectTable.lifespan,
      status: projectTable.status,
      taskCount: projectTable.taskCount,
      openTasks: projectTable.openTasks,
      createdAt: projectTable.createdAt,
      endsAt: projectTable.endsAt,
      ownerId: projectTable.ownerId,
      myRole: sql<string | null>`(
        select pm.role from project_members pm
        where pm.project_id = ${projectTable.id} and pm.user_id = ${viewerId}
      )`,
      memberCount: sql<number>`(
        select count(*)::int from project_members pm where pm.project_id = ${projectTable.id}
      )`,
      conversationId: sql<string | null>`(
        select c.id from ${conversationTable} c
        where c.project_id = ${projectTable.id} and c.removed_at is null
        limit 1
      )`,
    })
    .from(projectTable)
    .innerJoin(users, eq(users.id, projectTable.ownerId))
    .where(
      and(
        isNull(projectTable.removedAt),
        sql`not exists (
          select 1 from ${blocks} b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${projectTable.ownerId})
             or (b.blocker_id = ${projectTable.ownerId} and b.blocked_id = ${viewerId})
        )`,
        // A connection-visible project is visible to accepted connections;
        // private projects remain visible to their owner and current members.
        or(
          resourceVisibleToViewer(projectTable.visibility, projectTable.ownerId, viewerId),
          sql`exists (
            select 1 from project_members pm
            where pm.project_id = ${projectTable.id} and pm.user_id = ${viewerId}
          )`,
        ),
      ),
    )
    .orderBy(desc(projectTable.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];
  const ownerMap = await membersByIds(rows.map((row) => row.ownerId), viewerId);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    lifespan: row.lifespan,
    status: row.status,
    taskCount: row.taskCount,
    openTasks: row.openTasks,
    createdAt: row.createdAt,
    endsAt: row.endsAt,
    memberCount: row.memberCount,
    myRole: row.myRole,
    conversationId: row.conversationId,
    owner: ownerMap.get(row.ownerId)!,
  }));
}

export interface ProjectDetail extends ProjectView {
  tasks: Array<{
    id: string;
    title: string;
    detail: string;
    status: string;
    position: number;
    dueAt: Date | null;
    assignee: MemberSummary | null;
  }>;
  resources: Array<{
    fileId: string;
    displayName: string;
    contentType: string;
    byteSize: number;
    caption: string;
  }>;
  members: Array<MemberSummary & { role: string }>;
}

export async function projectBySlug(slug: string, viewerId: string): Promise<ProjectDetail | null> {
  const [head] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(and(eq(projectTable.slug, slug), isNull(projectTable.removedAt)))
    .limit(1);
  if (!head) return null;

  const list = await projectList(viewerId, 60);
  const project = list.find((entry) => entry.id === head.id);
  if (!project) return null;

  const [taskRows, memberRows, resourceRows] = await Promise.all([
    db
      .select({
        id: sql<string>`pt.id`,
        title: sql<string>`pt.title`,
        detail: sql<string>`pt.detail`,
        status: sql<string>`pt.status`,
        position: sql<number>`pt.position`,
        dueAt: sql<Date | null>`pt.due_at`,
        assigneeId: sql<string | null>`pt.assignee_id`,
      })
    .from(sql`project_tasks pt`)
      .where(sql`pt.project_id = ${project.id}`)
      .orderBy(asc(sql`pt.position`), asc(sql`pt.created_at`))
      .limit(200),

    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        memberId: users.memberId,
        level: users.level,
        ageBand: users.ageBand,
        region: users.region,
        createdAt: users.createdAt,
        headline: profiles.headline,
        avatarObjectId: profiles.avatarObjectId,
        showRegion: userSettings.showRegion,
        hideAgeBand: userSettings.hideAgeBand,
        role: sql<string>`pm.role`,
      })
      .from(sql`project_members pm`)
      .innerJoin(users, eq(users.id, sql`pm.user_id`))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .where(sql`pm.project_id = ${project.id}`),

    db
      .select({
        fileId: files.id,
        displayName: files.displayName,
        detectedMime: files.detectedMime,
        byteSize: files.byteSize,
        caption: sql<string>`pr.caption`,
      })
      .from(sql`project_resources pr`)
      .innerJoin(files, eq(files.id, sql`pr.file_id`))
      .where(and(sql`pr.project_id = ${project.id}`, eq(files.state, 'clean'), isNull(files.removedAt), sql`exists (select 1 from storage_objects so where so.id = ${files.storageObjectId} and so.removed_at is null)`))
      .orderBy(desc(sql`pr.created_at`)),
  ]);

  const assigneeIds = taskRows
    .map((row) => row.assigneeId)
    .filter((id): id is string => Boolean(id));
  const assigneeMap = await membersByIds(assigneeIds, viewerId);

  return {
    ...project,
    tasks: taskRows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      status: row.status,
      position: row.position,
      dueAt: row.dueAt,
      assignee: row.assigneeId ? (assigneeMap.get(row.assigneeId) ?? null) : null,
    })),
    members: memberRows.map((row) => ({ ...projectMember(row, viewerId), role: row.role })),
    resources: resourceRows.map((row) => ({
      fileId: row.fileId,
      displayName: row.displayName,
      contentType: row.detectedMime ?? 'application/octet-stream',
      byteSize: row.byteSize,
      caption: row.caption,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════════════════

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: Date;
}

export async function notificationList(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationView[]> {
  const rows = await db
    .select({
      id: notificationTable.id,
      kind: notificationTable.kind,
      title: notificationTable.title,
      body: notificationTable.body,
      href: notificationTable.href,
      readAt: notificationTable.readAt,
      createdAt: notificationTable.createdAt,
    })
    .from(notificationTable)
    .where(
      and(
        eq(notificationTable.userId, userId),
        options.unreadOnly ? isNull(notificationTable.readAt) : sql`true`,
      ),
    )
    .orderBy(desc(notificationTable.createdAt))
    .limit(Math.min(options.limit ?? 40, 100));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: Boolean(row.readAt),
    createdAt: row.createdAt,
  }));
}

export async function notificationCounts(userId: string): Promise<{ unread: number; messages: number }> {
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationTable)
    .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)));

  const [messages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageTable)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messageTable.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(
      and(
        sql`${messageTable.senderId} <> ${userId}`,
        isNull(messageTable.removedAt),
        sql`${messageTable.createdAt} > coalesce(${conversationMembers.lastReadAt}, to_timestamp(0))`,
        sql`(${conversationMembers.mutedUntil} is null or ${conversationMembers.mutedUntil} < now())`,
      ),
    );

  return { unread: Number(unread?.count ?? 0), messages: Number(messages?.count ?? 0) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Blocks & matches
// ═══════════════════════════════════════════════════════════════════════════

export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await db.select({ blockedId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId));
  return rows.map((row) => row.blockedId);
}

export interface MatchView {
  id: string;
  mode: string;
  status: string;
  createdAt: Date;
  ageBandAtMatch: string | null;
  sharedInterestCount: number;
  partner: MemberSummary;
  conversationId: string | null;
}

export interface ConnectionRequestView {
  id: string;
  mode: string;
  note: string;
  createdAt: Date;
  from: MemberSummary;
}

export async function connectionRequestInbox(userId: string): Promise<ConnectionRequestView[]> {
  const rows = await db
    .select({
      id: connectionRequests.id,
      fromUserId: connectionRequests.fromUserId,
      mode: connectionRequests.mode,
      note: connectionRequests.note,
      createdAt: connectionRequests.createdAt,
    })
    .from(connectionRequests)
    .where(and(eq(connectionRequests.toUserId, userId), eq(connectionRequests.state, 'pending')))
    .orderBy(desc(connectionRequests.createdAt))
    .limit(60);

  const senders = await Promise.all(rows.map((row) => memberById(row.fromUserId, userId)));
  return rows.flatMap((row, index) => {
    const from = senders[index];
    return from ? [{ id: row.id, mode: row.mode, note: row.note, createdAt: row.createdAt, from }] : [];
  });
}

export async function matchesFor(userId: string, status: 'accepted' | 'pending' = 'accepted'): Promise<MatchView[]> {
  const rows = await db
    .select({
      id: matchTable.id,
      mode: matchTable.mode,
      status: matchTable.status,
      createdAt: matchTable.createdAt,
      ageBandAtMatch: matchTable.ageBandAtMatch,
      sharedInterestCount: matchTable.sharedInterestCount,
      userAId: matchTable.userAId,
      userBId: matchTable.userBId,
    })
    .from(matchTable)
    .where(
      and(
        eq(matchTable.status, status),
        sql`(${matchTable.userAId} = ${userId} or ${matchTable.userBId} = ${userId})`,
      ),
    )
    .orderBy(desc(matchTable.createdAt))
    .limit(100);

  if (rows.length === 0) return [];

  const partnerIds = rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
  const partnerEntries = await Promise.all(partnerIds.map(async (partnerId) => [partnerId, await memberById(partnerId, userId)] as const));
  const partnerMap = new Map(partnerEntries.filter((entry): entry is readonly [string, MemberSummary] => entry[1] !== null));

  return rows.flatMap((row, index) => {
    const partnerId = partnerIds[index]!;
    const partner = partnerMap.get(partnerId);
    if (!partner) return [];
    return [{
      id: row.id,
      mode: row.mode,
      status: row.status,
      createdAt: row.createdAt,
      ageBandAtMatch: row.ageBandAtMatch,
      sharedInterestCount: row.sharedInterestCount,
      partner,
      conversationId: null,
    }];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Achievements & profile activity
// ═══════════════════════════════════════════════════════════════════════════

export async function achievementsFor(userId: string) {
  const rows = await db
    .select({
      key: achievements.key,
      label: achievements.label,
      description: achievements.description,
      glyph: achievements.glyph,
      hidden: achievements.hidden,
      unlockedAt: userAchievements.unlockedAt,
    })
    .from(achievements)
    .leftJoin(userAchievements, eq(userAchievements.achievementId, achievements.id))
    .orderBy(asc(achievements.label));

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    glyph: row.glyph,
    hidden: row.hidden && !row.unlockedAt ? null : row.hidden,
    unlockedAt: row.unlockedAt,
  }));
}

export interface ProfileActivity {
  posts: number;
  comments: number;
  archiveContributions: number;
  games: number;
  galleryPieces: number;
  projects: number;
  eventsHosted: number;
  connections: number;
}

export async function profileActivity(userId: string): Promise<ProfileActivity> {
  const [result] = await db.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from ${postTable} where author_id = ${userId}
         and status = 'published' and removed_at is null) as posts,
      (select count(*)::int from ${commentTable} where author_id = ${userId}
         and status = 'published' and removed_at is null) as comments,
      (select count(*)::int from ${archiveObjectTable} where contributor_id = ${userId}
         and removed_at is null) as archive,
      (select count(*)::int from ${gameTable} where creator_id = ${userId}
         and status = 'approved' and removed_at is null) as games,
      (select count(*)::int from ${galleryPostTable} where author_id = ${userId}
         and status = 'published' and removed_at is null) as gallery,
      (select count(*)::int from project_members where user_id = ${userId}) as projects,
      (select count(*)::int from ${eventTable} where host_id = ${userId}
         and removed_at is null) as hosted,
      (select count(*)::int from ${matchTable} where status = 'accepted'
         and (user_a_id = ${userId} or user_b_id = ${userId})) as connections
  `);

  const row = (result as unknown as Array<Record<string, number>>)[0] ?? {};
  return {
    posts: Number(row.posts ?? 0),
    comments: Number(row.comments ?? 0),
    archiveContributions: Number(row.archive ?? 0),
    games: Number(row.games ?? 0),
    galleryPieces: Number(row.gallery ?? 0),
    projects: Number(row.projects ?? 0),
    eventsHosted: Number(row.hosted ?? 0),
    connections: Number(row.connections ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function closed(closesAt: Date | null): boolean {
  return closesAt ? closesAt.getTime() <= Date.now() : true;
}

function groupStrings<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  valueKey: 'kind' | 'tag',
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const groupKey = row[key];
    const value = row[valueKey];
    if (typeof groupKey !== 'string' || typeof value !== 'string') continue;
    const list = map.get(groupKey) ?? [];
    list.push(value);
    map.set(groupKey, list);
  }
  return map;
}

export { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql };