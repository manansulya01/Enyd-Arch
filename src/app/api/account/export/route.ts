import { eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~db';
import {
  archiveObjects,
  bookmarks,
  comments,
  connectionRequests,
  files,
  galleryPosts,
  events,
  filmReviews,
  films,
  matches,
  musicLikedTracks,
  musicPlaylistTracks,
  musicPlaylists,
  messages,
  notifications,
  posts,
  profiles,
  projectMembers,
  projectResources,
  projectTasks,
  projects,
  reactions,
  userAchievements,
  userFollows,
  userInterests,
  userSettings,
  users,
  rsvps,
  watchlistItems,
  watchlists,
} from '~db/schema';
import { requireOnboarded } from '~/server/guard';
import { acquire } from '~/server/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

export async function GET() {
  const { actor } = await requireOnboarded();
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Please wait before requesting another account export.' },
      { status: 429, headers: { ...noStore, 'Retry-After': '60' } },
    );
  }

  const userId = actor.userId;
  const [accountRows, profileRows, settingsRows, authoredPosts, authoredComments,
    ownBookmarks, ownReactions, sentMessages, ownNotifications, ownFiles,
    ownArchiveObjects, ownGalleryPosts, outgoingRequests, incomingRequests,
    ownMatches, ownFollows, ownInterests, ownAchievements] = await Promise.all([
    db.select({
      id: users.id, memberId: users.memberId, username: users.username,
      displayName: users.displayName, email: users.email, emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone, legalName: users.legalName, ageBand: users.ageBand, isMinor: users.isMinor,
      region: users.region, status: users.status, level: users.level, onboardedAt: users.onboardedAt,
      termsAcceptedAt: users.termsAcceptedAt, createdAt: users.createdAt, updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({
      id: posts.id, body: posts.body, status: posts.status, visibility: posts.visibility,
      linkUrl: posts.linkUrl, linkTitle: posts.linkTitle, repostOfId: posts.repostOfId,
      pinned: posts.pinned, editedAt: posts.editedAt, removedAt: posts.removedAt, createdAt: posts.createdAt,
    }).from(posts).where(eq(posts.authorId, userId)),
    db.select({
      id: comments.id, postId: comments.postId, parentId: comments.parentId, body: comments.body,
      status: comments.status, createdAt: comments.createdAt, editedAt: comments.editedAt, removedAt: comments.removedAt,
    }).from(comments).where(eq(comments.authorId, userId)),
    db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
    db.select({
      id: reactions.id, targetType: reactions.targetType, targetId: reactions.targetId,
      kind: reactions.kind, createdAt: reactions.createdAt,
    }).from(reactions).where(eq(reactions.userId, userId)),
    db.select({
      id: messages.id, conversationId: messages.conversationId, body: messages.body,
      replyToId: messages.replyToId, attachmentFileId: messages.attachmentFileId,
      editedAt: messages.editedAt, removedAt: messages.removedAt, createdAt: messages.createdAt,
    }).from(messages).where(eq(messages.senderId, userId)),
    db.select({
      id: notifications.id, kind: notifications.kind, title: notifications.title,
      body: notifications.body, href: notifications.href, actorId: notifications.actorId,
      targetType: notifications.targetType, targetId: notifications.targetId,
      readAt: notifications.readAt, createdAt: notifications.createdAt,
    }).from(notifications).where(eq(notifications.userId, userId)),
    db.select({
      id: files.id, originalName: files.originalName, displayName: files.displayName,
      extension: files.extension, byteSize: files.byteSize, declaredMime: files.declaredMime,
      detectedMime: files.detectedMime, state: files.state,
      createdAt: files.createdAt, removedAt: files.removedAt,
    }).from(files).where(eq(files.uploaderId, userId)),
    db.select({
      id: archiveObjects.id, slug: archiveObjects.slug, catalogueNumber: archiveObjects.catalogueNumber,
      title: archiveObjects.title, description: archiveObjects.description, category: archiveObjects.category,
      visibility: archiveObjects.visibility, fileId: archiveObjects.fileId, license: archiveObjects.license,
      attribution: archiveObjects.attribution, removedAt: archiveObjects.removedAt,
      createdAt: archiveObjects.createdAt, updatedAt: archiveObjects.updatedAt,
    }).from(archiveObjects).where(eq(archiveObjects.contributorId, userId)),
    db.select({
      id: galleryPosts.id, title: galleryPosts.title, caption: galleryPosts.caption,
      visibility: galleryPosts.visibility, status: galleryPosts.status,
      createdAt: galleryPosts.createdAt, updatedAt: galleryPosts.updatedAt,
    }).from(galleryPosts).where(eq(galleryPosts.authorId, userId)),
    db.select({
      id: connectionRequests.id, toUserId: connectionRequests.toUserId, mode: connectionRequests.mode,
      note: connectionRequests.note, state: connectionRequests.state,
      respondedAt: connectionRequests.respondedAt, createdAt: connectionRequests.createdAt,
    }).from(connectionRequests).where(eq(connectionRequests.fromUserId, userId)),
    db.select({
      id: connectionRequests.id, fromUserId: connectionRequests.fromUserId, mode: connectionRequests.mode,
      note: connectionRequests.note, state: connectionRequests.state,
      respondedAt: connectionRequests.respondedAt, createdAt: connectionRequests.createdAt,
    }).from(connectionRequests).where(eq(connectionRequests.toUserId, userId)),
    db.select({
      id: matches.id, userAId: matches.userAId, userBId: matches.userBId, mode: matches.mode,
      status: matches.status, ageBandAtMatch: matches.ageBandAtMatch,
      sharedInterestCount: matches.sharedInterestCount, createdAt: matches.createdAt, updatedAt: matches.updatedAt,
    }).from(matches).where(or(eq(matches.userAId, userId), eq(matches.userBId, userId))),
    db.select().from(userFollows).where(or(eq(userFollows.followerId, userId), eq(userFollows.followedId, userId))),
    db.select().from(userInterests).where(eq(userInterests.userId, userId)),
    db.select().from(userAchievements).where(eq(userAchievements.userId, userId)),
  ]);

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: accountRows[0] ?? null,
    profile: profileRows[0] ?? null,
    privacyAndNotificationSettings: settingsRows[0] ?? null,
    content: {
      posts: authoredPosts,
      comments: authoredComments,
      bookmarks: ownBookmarks,
      reactions: ownReactions,
      messagesSent: sentMessages,
      notifications: ownNotifications,
      uploadedFileMetadata: ownFiles,
      archiveContributions: ownArchiveObjects,
      galleryPosts: ownGalleryPosts,
    },
    connections: {
      requestsSent: outgoingRequests,
      requestsReceived: incomingRequests,
      matches: ownMatches,
      follows: ownFollows,
    },
    interests: ownInterests,
    achievements: ownAchievements,
    exclusions: [
      'Passwords, passkeys, session tokens, recovery secrets, encryption keys, IP hashes, and internal security audit records are not included.',
      'File contents are not embedded; this export includes file metadata only.',
      'Messages authored by other participants are not included in this export.',
    ],
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      ...noStore,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="enyd-arch-account-export-${date}.json"`,
    },
  });
}
