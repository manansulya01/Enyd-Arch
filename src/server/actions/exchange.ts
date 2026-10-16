'use server';

/**
 * The Exchange & The Archive
 *
 * Uploads land in `files` through the storage pipeline (validate → scan →
 * store). Every accepted upload can become an Archive object — a catalogued,
 * tagged, describable catalogue entry with its own page.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  archiveComments,
  archiveObjectTags,
  archiveObjects,
  files,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { CATEGORY_LABELS } from '~/server/queries';
import { slugify, excerpt } from '~/lib/format';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { notify } from '~/server/notify';
import { storeUpload, uploadRestricted } from '~/server/storage/uploads';

export async function uploadFile(
  _previous: ActionResult<{ fileId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ fileId: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  if (await uploadRestricted(actor.userId)) {
    return fail('Your uploading has been restricted. Contact Administration.');
  }

  const limiter = await acquire('upload', actor.userId);
  if (!limiter.allowed) return fail('Too many uploads. Rest for an hour.');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return fail('Choose a file to upload.', { file: ['Required.'] });
  }
  if (file.size > 100 * 1024 * 1024) {
    return fail('That file is over the 100 MB limit.');
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const stored = await storeUpload({
    uploaderId: actor.userId,
    filename: file.name,
    declaredMime: file.type || 'application/octet-stream',
    data,
    purpose: 'upload',
  });

  if (!stored.ok) return fail(stored.message, { file: stored.findings.map((finding) => finding.detail).slice(0, 3) });

  return ok({ fileId: stored.file.fileId });
}

export async function createArchiveObject(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const title = String(formData.get('title') ?? '').trim().slice(0, 180);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000);
  const category = String(formData.get('category') ?? '');
  const fileId = String(formData.get('fileId') ?? '') || null;
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((tag) => slugify(tag).slice(0, 32))
    .filter(Boolean)
    .slice(0, 8);
  const attribution = String(formData.get('attribution') ?? '').trim().slice(0, 160);

  if (title.length < 2) return fail('Give the object a title.', { title: ['Too short.'] });
  if (!(category in CATEGORY_LABELS)) return fail('Choose a category.', { category: ['Required.'] });

  if (fileId) {
    const [owned] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.uploaderId, actor.userId), isNull(files.removedAt)))
      .limit(1);
    if (!owned) return fail('That upload is not available.');
  }

  const catalogueRows = (await db.execute(
    sql`select coalesce(max(catalogue_number), 300) + 1 as next from archive_objects`,
  )) as unknown as Array<{ next: number }>;
  const catalogueNumber = Number(catalogueRows[0]?.next ?? 301);

  const base = slugify(title) || 'object';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const taken = await db
      .select({ id: archiveObjects.id })
      .from(archiveObjects)
      .where(eq(archiveObjects.slug, slug))
      .limit(1);
    if (!taken[0]) break;
    slug = `${base}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(archiveObjects)
    .values({
      catalogueNumber,
      slug,
      title,
      description,
      category: category as never,
      contributorId: actor.userId,
      fileId,
      attribution: attribution || null,
    })
    .returning({ id: archiveObjects.id, slug: archiveObjects.slug });

  for (const tag of tags) {
    await db.insert(archiveObjectTags).values({ objectId: created!.id, tag }).onConflictDoNothing();
  }

  revalidatePath('/archive');
  return ok({ slug: created!.slug });
}

export async function commentOnArchiveObject(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const objectId = String(formData.get('objectId') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  if (!objectId || !body) return fail('Write something first.');

  const limiter = await acquire('comment', actor.userId);
  if (!limiter.allowed) return fail('Replying very quickly. Take a breath.');

  const [object] = await db
    .select({ contributorId: archiveObjects.contributorId, slug: archiveObjects.slug })
    .from(archiveObjects)
    .where(and(eq(archiveObjects.id, objectId), isNull(archiveObjects.removedAt)))
    .limit(1);
  if (!object) return fail('That object is not available.');

  await db.insert(archiveComments).values({ objectId, authorId: actor.userId, body });
  await db
    .update(archiveObjects)
    .set({ commentCount: sql`${archiveObjects.commentCount} + 1` })
    .where(eq(archiveObjects.id, objectId));

  if (object.contributorId && object.contributorId !== actor.userId) {
    await notify({
      userId: object.contributorId,
      kind: 'reply',
      title: `${actor.displayName} commented on your Archive object`,
      body: excerpt(body, 140),
      href: `/archive/${object.slug}`,
      actorId: actor.userId,
    });
  }

  revalidatePath(`/archive/${object.slug}`);
  return ok();
}

export async function downloadArchiveObject(objectId: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  await db
    .update(archiveObjects)
    .set({ downloadCount: sql`${archiveObjects.downloadCount} + 1` })
    .where(eq(archiveObjects.id, objectId));
  return ok();
}
