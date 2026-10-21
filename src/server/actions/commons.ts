'use server';

/**
 * The Commons
 *
 * Posts, comments, reactions, polls, bookmarks, reposts. Every mutation here
 * goes through the same order: rate limit → CSRF → authorisation → write →
 * notification, and every count is maintained in the same statement as the row
 * that changed it so a feed can never disagree with the row it rendered from.
 */
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '~db';
import {
  archiveObjects,
  bookmarks,
  comments,
  files,
  galleryPosts,
  games,
  gameComments,
  hashtags,
  postAttachments,
  postHashtags,
  postMentions,
  posts,
  pollOptions,
  polls,
  pollVotes,
  reactions,
  storageObjects,
  users,
} from '~db/schema';
import { fail, issuesToErrors, ok, type ActionResult } from '~/lib/action-result';
import { REACTIONS } from '~/lib/domain';
import { slugify } from '~/lib/format';
import { can, type SessionActor } from '~/server/auth/session';
import { isUuid } from '~/server/auth/identifiers';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { notify } from '~/server/notify';
import { maybeUnlock } from '~/server/society';

const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 2500;
const RESERVED_HANDLE = /[<>]/;

export type ReactionTargetType = 'post' | 'comment' | 'archive_object' | 'game' | 'gallery_post' | 'game_comment';

// ═══════════════════════════════════════════════════════════════════════════
// Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pulls `#topic` and `@handle` out of a body.
 *
 * Hashtags are constrained to a conservative character set and capped, because
 * they become catalogue keys. Mentions are resolved against real accounts and
 * silently dropped when they do not match — an unresolved mention must not
 * become a notification to nobody.
 */
function extractReferences(body: string): { tags: string[]; handles: string[] } {
  const tags = new Set<string>();
  const handles = new Set<string>();

  for (const match of body.matchAll(/(^|[\s(])#([a-z0-9][a-z0-9_-]{0,30})/gi)) {
    tags.add(match[2]!.toLowerCase());
  }
  for (const match of body.matchAll(/(^|[\s(])@([a-z0-9][a-z0-9._-]{1,23})/gi)) {
    handles.add(match[2]!.toLowerCase());
  }

  return { tags: [...tags].slice(0, 6), handles: [...handles].slice(0, 10) };
}

async function resolveMentions(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(sql`lower(${users.username})`, handles),
        isNull(users.removedAt),
        eq(users.status, 'active'),
      ),
    );
  return rows.map((row) => row.id);
}

/** Strips angle brackets, which have no place in member-written text. */
function sanitiseText(value: string, maxLength: number): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(RESERVED_HANDLE, '')
    .slice(0, maxLength)
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// Posting
// ═══════════════════════════════════════════════════════════════════════════

export interface CreatePostInput {
  body: string;
  poll?: { question: string; options: string[]; multiSelect: boolean } | null;
  attachmentFileIds?: string[];
  repostOfId?: string | null;
}

export async function createPost(
  actor: SessionActor,
  input: CreatePostInput,
): Promise<ActionResult<{ postId: string }>> {
  if (!can(actor, 'post')) {
    return fail('You do not have permission to post in the Commons.');
  }
  if (input.repostOfId && !isUuid(input.repostOfId)) return fail('That post is not available.');
  if ((input.attachmentFileIds ?? []).some((id) => !isUuid(id))) return fail('One or more attachments are not available.');

  const limiter = await acquire('post', actor.userId);
  if (!limiter.allowed) {
    return fail('You are posting quite quickly. Wait a moment before adding another.');
  }

  const body = sanitiseText(input.body ?? '', MAX_POST_LENGTH);
  const hasPoll = Boolean(input.poll && input.poll.options.length >= 2);

  if (!body && !hasPoll && (input.attachmentFileIds?.length ?? 0) === 0) {
    return fail('Write something, attach something, or ask a question.', {
      body: ['A post needs a body, a poll, or an attachment.'],
    });
  }

  // Attachments must belong to the poster and have cleared the scanner.
  let attachmentIds: string[] = [];
  if (input.attachmentFileIds && input.attachmentFileIds.length > 0) {
    const owned = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          inArray(files.id, input.attachmentFileIds),
          eq(files.uploaderId, actor.userId),
          eq(files.state, 'clean'),
          isNull(files.removedAt),
          sql`exists (
            select 1 from storage_objects so
            where so.id = ${files.storageObjectId}
              and so.removed_at is null
          )`,
        ),
      );
    attachmentIds = owned.map((row) => row.id);

    if (attachmentIds.length !== new Set(input.attachmentFileIds).size) {
      return fail('One or more attachments are no longer available.');
    }
  }

  const repostOfId = input.repostOfId ?? null;
  if (repostOfId) {
    // Refuse reposting something invisible, and refuse self-repost chains.
    const original = await db
      .select({ id: posts.id, repostOfId: posts.repostOfId })
      .from(posts)
      .where(and(eq(posts.id, repostOfId), eq(posts.status, 'published'), inArray(posts.visibility, ['members', 'public']), isNull(posts.removedAt)))
      .limit(1);
    if (!original[0]) return fail('That post is no longer available.');
    if (original[0].repostOfId) return fail('That post is itself a repost.');
  }

  const now = new Date();
  const [row] = await db
    .insert(posts)
    .values({
      authorId: actor.userId,
      body: body || null,
      repostOfId,
      lastActivityAt: now,
      // Reposts bump the original so a conversation stays at the top while it
      // is moving.
      ...(repostOfId ? {} : {}),
    })
    .returning({ id: posts.id });

  const postId = row!.id;

  // ── Hashtags ──────────────────────────────────────────────────────────
  const { tags, handles } = extractReferences(body);
  for (const tag of tags) {
    await db.insert(postHashtags).values({ postId, tag }).onConflictDoNothing();
    await db
      .insert(hashtags)
      .values({ tag })
      .onConflictDoUpdate({ target: hashtags.tag, set: { useCount: sql`${hashtags.useCount} + 1` } });
  }

  // ── Mentions ──────────────────────────────────────────────────────────
  const mentionedUserIds = await resolveMentions(handles);
  for (const userId of mentionedUserIds) {
    if (userId === actor.userId) continue;
    await db.insert(postMentions).values({ postId, mentionedUserId: userId }).onConflictDoNothing();
  }

  // ── Attachments ───────────────────────────────────────────────────────
  if (attachmentIds.length > 0) {
    for (const [position, fileId] of attachmentIds.entries()) {
      await db.insert(postAttachments).values({ postId, fileId, position });
    }
  }

  // ── Poll ──────────────────────────────────────────────────────────────
  if (hasPoll && input.poll) {
    const question = sanitiseText(input.poll.question, 200);
    const options = input.poll.options
      .map((option) => sanitiseText(option, 100))
      .filter(Boolean)
      .slice(0, 8);

    if (options.length >= 2) {
      const [created] = await db.insert(polls).values({
        postId,
        question,
        multiSelect: input.poll.multiSelect,
        closesAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }).returning({ id: polls.id });

      for (const [position, label] of options.entries()) {
        await db.insert(pollOptions).values({ pollId: created!.id, label, position });
      }
    }
  }

  // ── Counters & notifications ──────────────────────────────────────────
  if (repostOfId) {
    await db
      .update(posts)
      .set({ repostCount: sql`${posts.repostCount} + 1`, lastActivityAt: now })
      .where(eq(posts.id, repostOfId));

    const original = await db
      .select({ authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, repostOfId))
      .limit(1);
    if (original[0]) {
      await notify({
        userId: original[0].authorId,
        kind: 'repost',
        title: `${actor.displayName} shared your post`,
        href: `/commons/${postId}`,
        actorId: actor.userId,
      });
    }
  }

  for (const userId of mentionedUserIds) {
    if (userId === actor.userId) continue;
    await notify({
      userId,
      kind: 'mention',
      title: `${actor.displayName} mentioned you`,
      body: body.slice(0, 140),
      href: `/commons/${postId}`,
      actorId: actor.userId,
    });
  }

  await maybeUnlock('firstPost', { userId: actor.userId });

  revalidatePath('/commons');
  return ok({ postId });
}

// ═══════════════════════════════════════════════════════════════════════════
// Comments
// ═══════════════════════════════════════════════════════════════════════════

export async function createComment(
  actor: SessionActor,
  input: { postId: string; body: string; parentId?: string | null },
): Promise<ActionResult<{ commentId: string }>> {
  if (!can(actor, 'comment')) return fail('You do not have permission to reply.');
  if (!isUuid(input.postId) || (input.parentId && !isUuid(input.parentId))) return fail('That conversation is not available.');

  const limiter = await acquire('comment', actor.userId);
  if (!limiter.allowed) return fail('You are replying very quickly. Take a breath.');

  const body = sanitiseText(input.body ?? '', MAX_COMMENT_LENGTH);
  if (body.length < 1) return fail('Write something first.', { body: ['Cannot be empty.'] });

  // The parent post must be visible to this member.
  const post = await db
    .select({ id: posts.id, authorId: posts.authorId, title: sql<string | null>`left(${posts.body}, 60)` })
    .from(posts)
    .where(
      and(
        eq(posts.id, input.postId),
        eq(posts.status, 'published'),
        isNull(posts.removedAt),
        inArray(posts.visibility, ['members', 'public']),
      ),
    )
    .limit(1);

  if (!post[0]) return fail('That conversation is no longer available.');

  // A reply must point at a comment on this post, or the thread is malformed.
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await db
      .select({ id: comments.id, parentId: comments.parentId })
      .from(comments)
      .where(
        and(
          eq(comments.id, input.parentId),
          eq(comments.postId, input.postId),
          isNull(comments.removedAt),
        ),
      )
      .limit(1);

    if (!parent[0]) return fail('That reply is no longer available.');
    // Re-parent to the top of the branch so depth stays bounded.
    parentId = parent[0].parentId ?? parent[0].id;
  }

  const [row] = await db
    .insert(comments)
    .values({
      postId: input.postId,
      authorId: actor.userId,
      parentId,
      body,
    })
    .returning({ id: comments.id });

  await db
    .update(posts)
    .set({ commentCount: sql`${posts.commentCount} + 1`, lastActivityAt: new Date() })
    .where(eq(posts.id, input.postId));

  if (post[0].authorId !== actor.userId) {
    await notify({
      userId: post[0].authorId,
      kind: 'reply',
      title: `${actor.displayName} replied to you`,
      body: body.slice(0, 140),
      href: `/commons/${input.postId}`,
      actorId: actor.userId,
    });
  }

  const { handles } = extractReferences(body);
  for (const userId of await resolveMentions(handles)) {
    if (userId === actor.userId || userId === post[0].authorId) continue;
    await notify({
      userId,
      kind: 'mention',
      title: `${actor.displayName} mentioned you`,
      body: body.slice(0, 140),
      href: `/commons/${input.postId}`,
      actorId: actor.userId,
    });
  }

  revalidatePath(`/commons/${input.postId}`);
  revalidatePath('/commons');
  return ok({ commentId: row!.id });
}

export async function deleteComment(
  actor: SessionActor,
  commentId: string,
): Promise<ActionResult> {
  const rows = await db
    .select({ id: comments.id, authorId: comments.authorId, postId: comments.postId })
    .from(comments)
    .where(and(eq(comments.id, commentId), isNull(comments.removedAt)))
    .limit(1);

  const comment = rows[0];
  if (!comment) return fail('That comment is already gone.');

  const { adminContextFor, adminCan } = await import('~/server/security/audit');
  const admin = await adminContextFor(actor.userId);
  const isModerator = admin ? adminCan(admin, 'content.remove') : false;

  if (comment.authorId !== actor.userId && !isModerator) {
    return fail('You can only remove your own replies.');
  }

  // Soft delete: replies beneath it stay visible and threaded.
  await db
    .update(comments)
    .set({ removedAt: new Date(), status: 'removed', body: '' })
    .where(eq(comments.id, commentId));

  await db
    .update(posts)
    .set({ commentCount: sql`greatest(0, ${posts.commentCount} - 1)` })
    .where(eq(posts.id, comment.postId));

  revalidatePath(`/commons/${comment.postId}`);
  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Reactions
// ═══════════════════════════════════════════════════════════════════════════

const REACTION_KEYS = new Set<string>(REACTIONS.map((reaction) => reaction.key));

/**
 * The counter column each reactive target maintains, resolved in one place so
 * a new target cannot be added without deciding how its count is kept.
 */
function reactionCounter(targetType: ReactionTargetType) {
  switch (targetType) {
    case 'post':
      return { table: posts, column: posts.reactionCount };
    case 'comment':
      return { table: comments, column: comments.reactionCount };
    case 'archive_object':
      return { table: archiveObjects, column: archiveObjects.reactionCount };
    case 'game':
      return { table: games, column: games.reactionCount };
    case 'gallery_post':
      return { table: galleryPosts, column: galleryPosts.reactionCount };
    case 'game_comment':
      return { table: gameComments, column: gameComments.reactionCount };
    default:
      return null;
  }
}

/**
 * Toggles a reaction.
 *
 * The unique index on (user, target, kind) makes the operation idempotent under
 * retries, and the counter is moved in the same statement as the delete so the
 * number on a card always matches the ledger.
 */
export async function toggleReaction(
  actor: SessionActor,
  input: { targetType: ReactionTargetType; targetId: string; kind: string },
): Promise<ActionResult<{ active: boolean; count: number }>> {
  if (!isUuid(input.targetId)) return fail('That item is not available.');
  if (!REACTION_KEYS.has(input.kind)) return fail('That is not a reaction Enyd Arch offers.');
  if (!can(actor, 'react')) return fail('You do not have permission to react.');

  const target = reactionCounter(input.targetType);
  if (!target) return fail('That cannot be reacted to.');
  const { table, column } = target;

  // Do not create reaction rows for missing or soft-deleted targets. This
  // lookup is also a guard against callers forging a target type/id pair.
  const [availableTarget] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, input.targetId), isNull(table.removedAt)))
    .limit(1);
  if (!availableTarget) return fail('That item is no longer available.');

  // Reaction APIs must enforce the same visibility boundary as the feed. A
  // valid UUID is not proof that a caller can see the underlying content.
  if (input.targetType === 'post') {
    const [visiblePost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(
        eq(posts.id, input.targetId),
        eq(posts.status, 'published'),
        inArray(posts.visibility, ['members', 'public']),
        isNull(posts.removedAt),
      ))
      .limit(1);
    if (!visiblePost) return fail('That item is no longer available.');
  } else if (input.targetType === 'comment') {
    const [visibleComment] = await db
      .select({ id: comments.id })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(and(
        eq(comments.id, input.targetId),
        eq(comments.status, 'published'),
        isNull(comments.removedAt),
        eq(posts.status, 'published'),
        inArray(posts.visibility, ['members', 'public']),
        isNull(posts.removedAt),
      ))
      .limit(1);
    if (!visibleComment) return fail('That item is no longer available.');
  } else if (input.targetType === 'gallery_post') {
    const [visibleGalleryPost] = await db
      .select({ id: galleryPosts.id })
      .from(galleryPosts)
      .where(and(
        eq(galleryPosts.id, input.targetId),
        inArray(galleryPosts.visibility, ['members', 'public']),
        isNull(galleryPosts.removedAt),
      ))
      .limit(1);
    if (!visibleGalleryPost) return fail('That item is no longer available.');
  } else if (input.targetType === 'archive_object') {
    const [visibleArchiveObject] = await db
      .select({ id: archiveObjects.id })
      .from(archiveObjects)
      .where(and(
        eq(archiveObjects.id, input.targetId),
        inArray(archiveObjects.visibility, ['members', 'public']),
        isNull(archiveObjects.removedAt),
      ))
      .limit(1);
    if (!visibleArchiveObject) return fail('That item is no longer available.');
  } else if (input.targetType === 'game') {
    const [approvedGame] = await db
      .select({ id: games.id })
      .from(games)
      .where(and(
        eq(games.id, input.targetId),
        eq(games.status, 'approved'),
        isNull(games.removedAt),
      ))
      .limit(1);
    if (!approvedGame) return fail('That item is no longer available.');
  } else if (input.targetType === 'game_comment') {
    const [visibleGameComment] = await db
      .select({ id: gameComments.id })
      .from(gameComments)
      .innerJoin(games, eq(games.id, gameComments.gameId))
      .where(and(
        eq(gameComments.id, input.targetId),
        eq(gameComments.status, 'published'),
        isNull(gameComments.removedAt),
        eq(games.status, 'approved'),
        isNull(games.removedAt),
      ))
      .limit(1);
    if (!visibleGameComment) return fail('That item is no longer available.');
  }

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const existing = await db
    .select({ id: reactions.id })
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, actor.userId),
        eq(reactions.targetType, input.targetType),
        eq(reactions.targetId, input.targetId),
        eq(reactions.kind, input.kind),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db.delete(reactions).where(eq(reactions.id, existing[0].id));
    const [updated] = await db
      .update(table)
      .set({ [column.name]: sql`greatest(0, ${column} - 1)` })
      .where(eq(table.id, input.targetId))
      .returning({ count: column });
    return ok({ active: false, count: Number(updated?.count ?? 0) });
  }

  await db.insert(reactions).values({
    userId: actor.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    kind: input.kind,
  });

  const [updated] = await db
    .update(table)
    .set({ [column.name]: sql`${column} + 1` })
    .where(eq(table.id, input.targetId))
    .returning({ count: column });

  // Notify the owner, once, and only for the first reaction of any kind.
  if (input.targetType === 'post') {
    const owner = await db
      .select({ authorId: posts.authorId, reactionCount: posts.reactionCount })
      .from(posts)
      .where(eq(posts.id, input.targetId))
      .limit(1);
    if (owner[0] && owner[0].authorId !== actor.userId && owner[0].reactionCount <= 1) {
      await notify({
        userId: owner[0].authorId,
        kind: 'reaction',
        title: `${actor.displayName} appreciated your post`,
        href: `/commons/${input.targetId}`,
        actorId: actor.userId,
      });
    }
  }

  return ok({ active: true, count: Number(updated?.count ?? 0) });
}

// ═══════════════════════════════════════════════════════════════════════════
// Polls
// ═══════════════════════════════════════════════════════════════════════════

export async function voteInPoll(
  actor: SessionActor,
  input: { pollId: string; optionId: string },
): Promise<ActionResult> {
  if (!isUuid(input.pollId) || !isUuid(input.optionId)) return fail('That poll option is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const poll = await db
    .select({
      id: polls.id,
      postId: polls.postId,
      multiSelect: polls.multiSelect,
      closesAt: polls.closesAt,
      optionPollId: pollOptions.pollId,
    })
    .from(polls)
    .leftJoin(pollOptions, eq(pollOptions.id, input.optionId))
    .where(eq(polls.id, input.pollId))
    .limit(1);

  const found = poll[0];
  if (!found || found.optionPollId !== found.id) return fail('That option is not available.');
  if (found.closesAt && found.closesAt.getTime() < Date.now()) {
    return fail('This poll has closed.');
  }

  if (!found.multiSelect) {
    // Replace any previous vote so a member can change their mind.
    const previous = await db
      .select({ optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(and(eq(pollVotes.pollId, input.pollId), eq(pollVotes.userId, actor.userId)))
      .limit(1);

    if (previous[0] && previous[0].optionId === input.optionId) {
      return ok(); // already this option
    }

    if (previous[0]) {
      await db
        .update(pollOptions)
        .set({ votes: sql`greatest(0, ${pollOptions.votes} - 1)` })
        .where(eq(pollOptions.id, previous[0].optionId));
      await db
        .delete(pollVotes)
        .where(
          and(
            eq(pollVotes.pollId, input.pollId),
            eq(pollVotes.userId, actor.userId),
          ),
        );
    }

    await db.insert(pollVotes).values({
      pollId: input.pollId,
      optionId: input.optionId,
      userId: actor.userId,
    });
    await db
      .update(pollOptions)
      .set({ votes: sql`${pollOptions.votes} + 1` })
      .where(eq(pollOptions.id, input.optionId));

    revalidatePath(`/commons/${found.postId}`);
    return ok();
  }

  const existing = await db
    .select({ optionId: pollVotes.optionId })
    .from(pollVotes)
    .where(and(eq(pollVotes.pollId, input.pollId), eq(pollVotes.userId, actor.userId)))
    .limit(1);

  if (existing[0]?.optionId === input.optionId) return ok();

  await db.insert(pollVotes).values({
    pollId: input.pollId,
    optionId: input.optionId,
    userId: actor.userId,
  });
  await db
    .update(pollOptions)
    .set({ votes: sql`${pollOptions.votes} + 1` })
    .where(eq(pollOptions.id, input.optionId));

  revalidatePath(`/commons/${found.postId}`);
  return ok();
}

// ═══════════════════════════════════════════════════════════════════════════
// Bookmarks & reposts
// ═══════════════════════════════════════════════════════════════════════════

export async function toggleBookmark(
  actor: SessionActor,
  input: { targetType: 'post' | 'archive_object' | 'game' | 'gallery_post'; targetId: string; note?: string },
): Promise<ActionResult<{ saved: boolean }>> {
  if (!can(actor, 'bookmark')) return fail('You do not have permission to save.');
  if (!isUuid(input.targetId)) return fail('That item is not available.');
  if (!['post', 'archive_object', 'game', 'gallery_post'].includes(input.targetType)) {
    return fail('That item cannot be saved.');
  }

  // A bookmark is private, but creating one must not be an oracle for
  // private, removed, draft, or unapproved content. Match the visibility
  // boundary used by the corresponding public-facing catalogue.
  let available = false;
  if (input.targetType === 'post') {
    const [row] = await db.select({ id: posts.id }).from(posts).where(and(
      eq(posts.id, input.targetId),
      eq(posts.status, 'published'),
      inArray(posts.visibility, ['members', 'public']),
      isNull(posts.removedAt),
    )).limit(1);
    available = Boolean(row);
  } else if (input.targetType === 'archive_object') {
    const [row] = await db.select({ id: archiveObjects.id }).from(archiveObjects).where(and(
      eq(archiveObjects.id, input.targetId),
      inArray(archiveObjects.visibility, ['members', 'public']),
      isNull(archiveObjects.removedAt),
    )).limit(1);
    available = Boolean(row);
  } else if (input.targetType === 'game') {
    const [row] = await db.select({ id: games.id }).from(games).where(and(
      eq(games.id, input.targetId),
      eq(games.status, 'approved'),
      isNull(games.removedAt),
    )).limit(1);
    available = Boolean(row);
  } else if (input.targetType === 'gallery_post') {
    const [row] = await db.select({ id: galleryPosts.id }).from(galleryPosts).where(and(
      eq(galleryPosts.id, input.targetId),
      inArray(galleryPosts.visibility, ['members', 'public']),
      isNull(galleryPosts.removedAt),
    )).limit(1);
    available = Boolean(row);
  }
  if (!available) return fail('That item is no longer available.');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const existing = await db
    .select({ id: bookmarks.userId })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, actor.userId),
        eq(bookmarks.targetType, input.targetType),
        eq(bookmarks.targetId, input.targetId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, actor.userId),
          eq(bookmarks.targetType, input.targetType),
          eq(bookmarks.targetId, input.targetId),
        ),
      );
    return ok({ saved: false });
  }

  await db.insert(bookmarks).values({
    userId: actor.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    note: input.note?.slice(0, 500) ?? null,
  });

  await maybeUnlock('collector', { userId: actor.userId });
  return ok({ saved: true });
}

export async function repostPost(
  actor: SessionActor,
  postId: string,
): Promise<ActionResult<{ postId: string }>> {
  const result = await createPost(actor, { body: '', repostOfId: postId });
  return result;
}

