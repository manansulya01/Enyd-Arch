import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '~db';
import {
  archiveObjects,
  conversationMembers,
  conversations,
  files,
  galleryAttachments,
  galleryPosts,
  messages,
  postAttachments,
  posts,
  storageObjects,
  userRestrictions,
} from '~db/schema';
import { putObject } from './driver';
import { scanBytes } from './scanner';
import {
  formatBytes,
  sanitiseFilename,
  validateUpload,
  type UploadKind,
  type ValidationFinding,
} from './validate';

/**
 * The upload service.
 *
 * Bytes are validated, stored, and scanned before a `files` row is visible to
 * the rest of the application. A file that fails validation is never stored; a
 * file that fails scanning is stored but stays `quarantined` and unreachable.
 */

export interface StoreUploadInput {
  uploaderId: string;
  filename: string;
  declaredMime: string;
  data: Uint8Array;
  purpose?: 'upload' | 'gallery_media' | 'game_asset';
  expect?: UploadKind;
  /** Marks the object as publicly retrievable once clean */
  isPublic?: boolean;
}

export interface StoredFile {
  fileId: string;
  displayName: string;
  byteSize: number;
  serveContentType: string;
  extension: string;
  kind: UploadKind;
  state: 'clean' | 'quarantined' | 'infected' | 'rejected';
  findings: ValidationFinding[];
  storageObjectId: string | null;
  thumbnailObjectId: string | null;
}

export type StoreResult =
  | { ok: true; file: StoredFile }
  | { ok: false; message: string; findings: ValidationFinding[] };

export async function storeUpload(input: StoreUploadInput): Promise<StoreResult> {
  const validation = await validateUpload({
    filename: input.filename,
    declaredMime: input.declaredMime,
    data: input.data,
    expect: input.expect,
  });

  if (!validation.ok || !validation.kind) {
    const blocking = validation.findings.find((finding) => finding.severity === 'blocking');
    return {
      ok: false,
      message: blocking?.detail ?? 'That file could not be accepted.',
      findings: validation.findings,
    };
  }

  const id = randomUUID();
  const stored = await putObject({
    purpose: input.purpose ?? 'upload',
    id,
    extension: validation.extension,
    data: input.data,
    contentType: validation.serveContentType,
  });

  const scan = await scanBytes(input.data);
  const state: StoredFile['state'] =
    scan.verdict === 'clean' ? 'clean' : scan.verdict === 'infected' ? 'infected' : 'quarantined';

  const [record] = await db
    .insert(files)
    .values({
      uploaderId: input.uploaderId,
      originalName: input.filename.slice(0, 200),
      displayName: sanitiseFilename(input.filename),
      checksum: stored.checksum,
      extension: validation.extension,
      byteSize: input.data.byteLength,
      declaredMime: input.declaredMime.slice(0, 120),
      detectedMime: validation.detectedMime,
      state,
      scanProvider: scan.provider,
      scanSignature: scan.signature,
      scanDetail: scan.detail,
      scannedAt: new Date(),
      storageObjectId: stored.id,
      isPublic: input.isPublic ?? false,
    })
    .returning();

  // An infected upload is destroyed immediately rather than held for review.
  if (scan.verdict === 'infected') {
    await db
      .update(storageObjects)
      .set({ removedAt: new Date() })
      .where(eq(storageObjects.id, stored.id));
  }

  return {
    ok: true,
    file: {
      fileId: record!.id,
      displayName: record!.displayName,
      byteSize: record!.byteSize,
      serveContentType: validation.serveContentType,
      extension: validation.extension,
      kind: validation.kind,
      state,
      findings: validation.findings,
      storageObjectId: stored.id,
      thumbnailObjectId: null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Authorisation for retrieval
// ═══════════════════════════════════════════════════════════════════════════

export type AccessVerdict = 'ok' | 'missing' | 'quarantined' | 'forbidden';

export interface AccessDecision {
  verdict: AccessVerdict;
  fileId?: string;
  reason?: string;
}

/**
 * Decides whether a member may retrieve a file.
 *
 * Callers pass the viewer (null when anonymous) and the file id. The rule set
 * is deliberately conservative: an unattached upload is visible only to its
 * owner, and anything attached to published content is visible to members.
 */
export async function resolveFileAccess(
  viewerId: string | null,
  fileId: string,
): Promise<AccessDecision> {
  const rows = await db
    .select({
      id: files.id,
      uploaderId: files.uploaderId,
      state: files.state,
      removedAt: files.removedAt,
      storageObjectId: files.storageObjectId,
      isPublic: files.isPublic,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  const file = rows[0];
  if (!file || file.removedAt || !file.storageObjectId) return { verdict: 'missing' };

  if (file.state !== 'clean') {
    if (file.uploaderId === viewerId) {
      return {
        verdict: 'quarantined',
        fileId,
        reason: 'This upload is still being checked.',
      };
    }
    return { verdict: 'quarantined', fileId };
  }

  if (viewerId && file.uploaderId === viewerId) {
    return { verdict: 'ok', fileId: file.id };
  }

  if (await isAttachedToVisibleContent(viewerId, fileId)) {
    return { verdict: 'ok', fileId: file.id };
  }

  if (file.isPublic && viewerId) return { verdict: 'ok', fileId: file.id };

  return { verdict: 'forbidden', fileId: file.id };
}

/**
 * A file is reachable when it hangs off content the viewer is allowed to see:
 * a published post, a published gallery piece, a visible Archive object, a
 * message in a conversation they belong to, or an approved game asset.
 */
async function isAttachedToVisibleContent(viewerId: string | null, fileId: string): Promise<boolean> {
  const publishedPost = await db
    .select({ id: postAttachments.id })
    .from(postAttachments)
    .innerJoin(posts, eq(posts.id, postAttachments.postId))
    .where(
      and(
        eq(postAttachments.fileId, fileId),
        eq(posts.status, 'published'),
        isNull(posts.removedAt),
        viewerId ? inArray(posts.visibility, ['members', 'public']) : eq(posts.visibility, 'public'),
      ),
    )
    .limit(1);
  if (publishedPost[0]) return true;

  const publishedGallery = await db
    .select({ id: galleryAttachments.id })
    .from(galleryAttachments)
    .innerJoin(galleryPosts, eq(galleryPosts.id, galleryAttachments.postId))
    .where(
      and(
        eq(galleryAttachments.fileId, fileId),
        eq(galleryPosts.status, 'published'),
        isNull(galleryPosts.removedAt),
        viewerId ? inArray(galleryPosts.visibility, ['members', 'public']) : eq(galleryPosts.visibility, 'public'),
      ),
    )
    .limit(1);
  if (publishedGallery[0]) return true;

  const archived = await db
    .select({ id: archiveObjects.id })
    .from(archiveObjects)
    .where(
      and(
        eq(archiveObjects.fileId, fileId),
        isNull(archiveObjects.removedAt),
        viewerId ? inArray(archiveObjects.visibility, ['members', 'public']) : eq(archiveObjects.visibility, 'public'),
      ),
    )
    .limit(1);
  if (archived[0]) return true;

  if (viewerId) {
    const inConversation = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(
        conversationMembers,
        eq(conversationMembers.conversationId, conversations.id),
      )
      .where(
        and(
          eq(messages.attachmentFileId, fileId),
          eq(conversationMembers.userId, viewerId),
          isNull(conversationMembers.removedAt),
          isNull(conversations.removedAt),
          isNull(messages.removedAt),
        ),
      )
      .limit(1);
    if (inConversation[0]) return true;
  }

  return false;
}

/** True when the viewer is currently restricted from uploading. */
export async function uploadRestricted(userId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ id: userRestrictions.id })
    .from(userRestrictions)
    .where(
      and(
        eq(userRestrictions.userId, userId),
        eq(userRestrictions.capability, 'upload'),
        sql`${userRestrictions.liftedAt} is null`,
        sql`(${userRestrictions.endsAt} is null or ${userRestrictions.endsAt} > ${now})`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function recentFilesForUser(userId: string, limit = 30) {
  return db
    .select()
    .from(files)
    .where(and(eq(files.uploaderId, userId), eq(files.state, 'clean')))
    .orderBy(desc(files.createdAt))
    .limit(limit);
}

export function describeSize(bytes: number): string {
  return formatBytes(bytes);
}