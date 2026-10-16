'use server';

/** The Gallery — creative work of any kind, with writing rendered inline. */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { files, galleryAttachments, galleryPosts } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { slugify } from '~/lib/format';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { GALLERY_KINDS } from '~/lib/domain';

const KINDS = new Set(GALLERY_KINDS.map((kind) => kind.value));

export async function createGalleryPost(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const kind = String(formData.get('kind') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 180);
  const caption = String(formData.get('caption') ?? '').trim().slice(0, 2000);
  const body = String(formData.get('body') ?? '').trim().slice(0, 20000);
  const fileIds = String(formData.get('fileIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!KINDS.has(kind as never)) return fail('Choose a medium.', { kind: ['Required.'] });
  if (title.length < 2) return fail('Give it a title.', { title: ['Too short.'] });
  if (kind === 'writing' && body.length < 40) {
    return fail('A writing piece needs at least a short body.', { body: ['Too short.'] });
  }
  if (kind !== 'writing' && fileIds.length === 0) {
    return fail('Attach at least one file, or upload first in the Exchange.', { fileIds: ['Required.'] });
  }

  if (fileIds.length > 0) {
    const owned = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          inArray(files.id, fileIds),
          eq(files.uploaderId, actor.userId),
          eq(files.state, 'clean'),
        ),
      );
    if (owned.length !== fileIds.length) return fail('One of those uploads is not available.');
  }

  const base = slugify(title) || 'piece';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const [taken] = await db.select({ id: galleryPosts.id }).from(galleryPosts).where(eq(galleryPosts.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(galleryPosts)
    .values({ slug, authorId: actor.userId, kind: kind as never, title, caption, body: body || null })
    .returning({ id: galleryPosts.id, slug: galleryPosts.slug });

  for (const [position, fileId] of fileIds.entries()) {
    await db.insert(galleryAttachments).values({ postId: created!.id, fileId, position });
  }

  revalidatePath('/gallery');
  return ok({ slug: created!.slug });
}

export async function commentOnGalleryPost(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const postId = String(formData.get('postId') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  if (!postId || !body) return fail('Write something first.');

  const [post] = await db
    .select({ slug: galleryPosts.slug })
    .from(galleryPosts)
    .where(and(eq(galleryPosts.id, postId), isNull(galleryPosts.removedAt)))
    .limit(1);
  if (!post) return fail('That piece is not available.');

  const { galleryComments } = await import('~db/schema');
  await db.insert(galleryComments).values({ postId, authorId: actor.userId, body });
  await db
    .update(galleryPosts)
    .set({ commentCount: sql`${galleryPosts.commentCount} + 1` })
    .where(eq(galleryPosts.id, postId));

  revalidatePath(`/gallery/${post.slug}`);
  return ok();
}
