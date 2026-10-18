import { and, eq, exists, inArray, isNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~db';
import {
  archiveObjects,
  collections,
  conversations,
  conversationMembers,
  events,
  films,
  files,
  games,
  galleryPosts,
  galleryAttachments,
  posts,
  postAttachments,
  profiles,
  projectMembers,
  projects,
  storageObjects,
  users,
  userSettings,
  messages,
} from '~db/schema';
import { currentActor } from '~/server/auth/session';
import { readObject } from '~/server/storage/driver';

/**
 * Stored object bytes are only served while a readable parent resource refers
 * to them. UUIDs are identifiers, never authorization. Unknown/orphaned objects
 * fail closed, and the parent visibility is checked on every request.
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
          inArray(profiles.profileVisibility, ['public', 'members']),
          inArray(userSettings.profileVisibility, ['public', 'members']),
          eq(users.status, 'active'),
          isNull(users.removedAt),
        )),
    ),
    exists(
      db.select({ one: archiveObjects.id })
        .from(archiveObjects)
        .where(and(
          eq(archiveObjects.previewObjectId, id),
          inArray(archiveObjects.visibility, ['public', 'members']),
          isNull(archiveObjects.removedAt),
        )),
    ),
    exists(
      db.select({ one: collections.id })
        .from(collections)
        .where(and(
          eq(collections.coverObjectId, id),
          inArray(collections.visibility, ['public', 'members']),
        )),
    ),
    exists(
      db.select({ one: projects.id })
        .from(projects)
        .where(and(
          eq(projects.coverObjectId, id),
          isNull(projects.removedAt),
          eq(projects.status, 'active'),
          or(
            inArray(projects.visibility, ['public', 'members']),
            eq(projects.ownerId, actor.userId),
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
        )),
    ),
    exists(
      db.select({ one: games.id })
        .from(games)
        .where(and(
          or(eq(games.packageObjectId, id), eq(games.thumbnailObjectId, id)),
          eq(games.status, 'approved'),
          isNull(games.removedAt),
        )),
    ),
    exists(
      db.select({ one: galleryPosts.id })
        .from(galleryPosts)
        .where(and(
          eq(galleryPosts.coverObjectId, id),
          eq(galleryPosts.status, 'published'),
          inArray(galleryPosts.visibility, ['public', 'members']),
          isNull(galleryPosts.removedAt),
        )),
    ),
    exists(
      db.select({ one: events.id })
        .from(events)
        .where(and(
          eq(events.coverObjectId, id),
          inArray(events.visibility, ['public', 'members']),
          isNull(events.removedAt),
          isNull(events.cancelledAt),
        )),
    ),
    exists(
      db.select({ one: films.id })
        .from(films)
        .where(eq(films.coverObjectId, id)),
    ),
    // File content is available to its uploader, when explicitly public, or
    // through a currently visible post/gallery/archive/conversation attachment.
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
                  eq(posts.status, 'published'),
                  inArray(posts.visibility, ['public', 'members']),
                  isNull(posts.removedAt),
                )),
            ),
            exists(
              db.select({ one: galleryPosts.id })
                .from(galleryPosts)
                .innerJoin(galleryAttachments, eq(galleryAttachments.postId, galleryPosts.id))
                .where(and(
                  eq(galleryAttachments.fileId, files.id),
                  eq(galleryPosts.status, 'published'),
                  inArray(galleryPosts.visibility, ['public', 'members']),
                  isNull(galleryPosts.removedAt),
                )),
            ),
            exists(
              db.select({ one: archiveObjects.id })
                .from(archiveObjects)
                .where(and(
                  eq(archiveObjects.fileId, files.id),
                  inArray(archiveObjects.visibility, ['public', 'members']),
                  isNull(archiveObjects.removedAt),
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
