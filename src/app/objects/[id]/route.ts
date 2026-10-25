import { and, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~db';
import {
  archiveObjects,
  blocks,
  collections,
  conversations,
  conversationMembers,
  events,
  films,
  files,
  games,
  galleryPosts,
  galleryAttachments,
  matches,
  messages,
  posts,
  postAttachments,
  profiles,
  projectMembers,
  projects,
  storageObjects,
  userSettings,
  users,
} from '~db/schema';
import { currentActor } from '~/server/auth/session';
import { readObject } from '~/server/storage/driver';

const noBlockBetween = (owner: unknown, viewerId: string) => sql`not exists (
  select 1 from ${blocks} b
  where (b.blocker_id = ${viewerId} and b.blocked_id = ${owner as never})
     or (b.blocker_id = ${owner as never} and b.blocked_id = ${viewerId})
)`;

const visibleToViewer = (visibility: unknown, owner: unknown, viewerId: string) => sql`(
  ${owner as never} = ${viewerId}
  or ${visibility as never} in ('public', 'members')
  or (
    ${visibility as never} = 'connections'
    and exists (
      select 1 from ${matches} m
      where m.status = 'accepted'
        and (
          (m.user_a_id = ${owner as never} and m.user_b_id = ${viewerId})
          or (m.user_b_id = ${owner as never} and m.user_a_id = ${viewerId})
        )
    )
  )
)`;

/**
 * Stored object bytes are served only while a live, readable parent references
 * them. UUIDs are identifiers, never authorization. Removed/orphaned objects
 * and content hidden by a member block fail closed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentActor();
  if (!actor) return notFound();

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return notFound();
  }

  const readableReference = or(
    exists(
      db.select({ one: profiles.userId })
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .innerJoin(userSettings, eq(userSettings.userId, profiles.userId))
        .where(and(
          or(eq(profiles.avatarObjectId, id), eq(profiles.bannerObjectId, id)),
          visibleToViewer(profiles.profileVisibility, profiles.userId, actor.userId),
          visibleToViewer(userSettings.profileVisibility, profiles.userId, actor.userId),
          eq(users.status, 'active'),
          isNull(users.removedAt),
          noBlockBetween(profiles.userId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: archiveObjects.id })
        .from(archiveObjects)
        .where(and(
          eq(archiveObjects.previewObjectId, id),
          visibleToViewer(archiveObjects.visibility, archiveObjects.contributorId, actor.userId),
          isNull(archiveObjects.removedAt),
          noBlockBetween(archiveObjects.contributorId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: collections.id })
        .from(collections)
        .where(and(
          eq(collections.coverObjectId, id),
          visibleToViewer(collections.visibility, collections.curatorId, actor.userId),
          noBlockBetween(collections.curatorId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: projects.id })
        .from(projects)
        .where(and(
          eq(projects.coverObjectId, id),
          isNull(projects.removedAt),
          eq(projects.status, 'active'),
          noBlockBetween(projects.ownerId, actor.userId),
          or(
            visibleToViewer(projects.visibility, projects.ownerId, actor.userId),
            exists(db.select({ one: projectMembers.projectId }).from(projectMembers).where(and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, actor.userId),
            ))),
          ),
        )),
    ),
    exists(
      db.select({ one: conversations.id })
        .from(conversations)
        .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
        .where(and(
          eq(conversations.avatarObjectId, id),
          isNull(conversations.removedAt),
          eq(conversationMembers.userId, actor.userId),
          isNull(conversationMembers.removedAt),
          sql`not exists (
            select 1 from ${conversationMembers} cm
            inner join ${blocks} b on
              (b.blocker_id = ${actor.userId} and b.blocked_id = cm.user_id)
              or (b.blocker_id = cm.user_id and b.blocked_id = ${actor.userId})
            where cm.conversation_id = ${conversations.id}
              and cm.user_id <> ${actor.userId}
              and cm.removed_at is null
          )`,
        )),
    ),
    exists(
      db.select({ one: games.id })
        .from(games)
        .innerJoin(users, eq(users.id, games.creatorId))
        .where(and(
          or(eq(games.packageObjectId, id), eq(games.thumbnailObjectId, id)),
          or(eq(games.creatorId, actor.userId), eq(games.status, 'approved')),
          eq(users.status, 'active'),
          isNull(users.removedAt),
          isNull(games.removedAt),
          noBlockBetween(games.creatorId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: galleryPosts.id })
        .from(galleryPosts)
        .where(and(
          eq(galleryPosts.coverObjectId, id),
          or(
            eq(galleryPosts.authorId, actor.userId),
            and(
              eq(galleryPosts.status, 'published'),
              visibleToViewer(galleryPosts.visibility, galleryPosts.authorId, actor.userId),
            ),
          ),
          isNull(galleryPosts.removedAt),
          noBlockBetween(galleryPosts.authorId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: events.id })
        .from(events)
        .where(and(
          eq(events.coverObjectId, id),
          or(
            eq(events.hostId, actor.userId),
            and(
              visibleToViewer(events.visibility, events.hostId, actor.userId),
              isNull(events.cancelledAt),
            ),
          ),
          isNull(events.removedAt),
          noBlockBetween(events.hostId, actor.userId),
        )),
    ),
    exists(
      db.select({ one: films.id })
        .from(films)
        .where(eq(films.coverObjectId, id)),
    ),
    // File bytes/previews are available to their uploader, explicitly public
    // files, or through live readable parent content.
    exists(
      db.select({ one: files.id })
        .from(files)
        .where(and(
          or(
            eq(files.storageObjectId, id),
            eq(files.thumbnailObjectId, id),
            eq(files.previewObjectId, id),
          ),
          isNull(files.removedAt),
          eq(files.state, 'clean'),
          or(
            eq(files.uploaderId, actor.userId),
            eq(files.isPublic, true),
            exists(
              db.select({ one: posts.id })
                .from(posts)
                .innerJoin(postAttachments, eq(postAttachments.postId, posts.id))
                .where(and(
                  eq(postAttachments.fileId, files.id),
                  or(
                    eq(posts.authorId, actor.userId),
                    and(
                      eq(posts.status, 'published'),
                      visibleToViewer(posts.visibility, posts.authorId, actor.userId),
                    ),
                  ),
                  isNull(posts.removedAt),
                  noBlockBetween(posts.authorId, actor.userId),
                )),
            ),
            exists(
              db.select({ one: galleryPosts.id })
                .from(galleryPosts)
                .innerJoin(galleryAttachments, eq(galleryAttachments.postId, galleryPosts.id))
                .where(and(
                  eq(galleryAttachments.fileId, files.id),
                  or(
                    eq(galleryPosts.authorId, actor.userId),
                    and(
                      eq(galleryPosts.status, 'published'),
                      visibleToViewer(galleryPosts.visibility, galleryPosts.authorId, actor.userId),
                    ),
                  ),
                  isNull(galleryPosts.removedAt),
                  noBlockBetween(galleryPosts.authorId, actor.userId),
                )),
            ),
            exists(
              db.select({ one: archiveObjects.id })
                .from(archiveObjects)
                .where(and(
                  eq(archiveObjects.fileId, files.id),
                  visibleToViewer(archiveObjects.visibility, archiveObjects.contributorId, actor.userId),
                  isNull(archiveObjects.removedAt),
                  noBlockBetween(archiveObjects.contributorId, actor.userId),
                )),
            ),
            exists(
              db.select({ one: messages.id })
                .from(messages)
                .innerJoin(conversations, eq(conversations.id, messages.conversationId))
                .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
                .where(and(
                  eq(messages.attachmentFileId, files.id),
                  eq(conversationMembers.userId, actor.userId),
                  isNull(conversationMembers.removedAt),
                  isNull(conversations.removedAt),
                  isNull(messages.removedAt),
                  sql`not exists (
                    select 1 from ${conversationMembers} cm
                    inner join ${blocks} b on
                      (b.blocker_id = ${actor.userId} and b.blocked_id = cm.user_id)
                      or (b.blocker_id = cm.user_id and b.blocked_id = ${actor.userId})
                    where cm.conversation_id = ${conversations.id}
                      and cm.user_id <> ${actor.userId}
                      and cm.removed_at is null
                  )`,
                )),
            ),
          ),
        )),
    ),
  );

  const [authorized] = await db
    .select({ id: storageObjects.id })
    .from(storageObjects)
    .where(and(eq(storageObjects.id, id), isNull(storageObjects.removedAt), readableReference))
    .limit(1);

  if (!authorized) return notFound();

  const object = await readObject(id);
  if (!object) return notFound();

  return new NextResponse(Buffer.from(object.data) as unknown as BodyInit, {
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.byteSize),
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

function notFound() {
  return new NextResponse('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
