'use server';

/**
 * Browser surface for Archive contributions. Actor is resolved from the
 * session; every write still goes through the core actions in ./exchange.
 */
import { redirect } from 'next/navigation';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { storeUpload, uploadRestricted } from '~/server/storage/uploads';
import {
  commentOnArchiveObject,
  createArchiveObject,
  uploadFile,
} from './exchange';

export interface ArchiveSubmission {
  title: string;
  description: string;
  category: string;
  tags: string;
  attribution?: string;
  fileId?: string | null;
}

export async function onCreateArchiveObject(
  input: ArchiveSubmission,
  csrf: string,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const formData = new FormData();
  formData.set('__csrf', csrf);
  formData.set('title', input.title);
  formData.set('description', input.description);
  formData.set('category', input.category);
  formData.set('tags', input.tags);
  if (input.attribution) formData.set('attribution', input.attribution);
  if (input.fileId) formData.set('fileId', input.fileId);

  // The core action verifies CSRF from the FormData it is handed, so a
  // structured browser call goes through the identical check.
  return createArchiveObject(null, formData);
}

export async function onCommentOnArchiveObject(input: {
  objectId: string;
  body: string;
  csrf: string;
}): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const formData = new FormData();
  formData.set('__csrf', input.csrf);
  formData.set('objectId', input.objectId);
  formData.set('body', input.body);
  await verifyCsrf(formData);
  return commentOnArchiveObject(null, formData);
}

/** Client-safe wrapper around the validated upload pipeline. */
export async function onUploadFile(formData: FormData): Promise<ActionResult<UploadResult>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  if (await uploadRestricted(actor.userId)) {
    return fail('Your uploading has been restricted by Administration.');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file first.');
  if (file.size > 100 * 1024 * 1024) return fail('That file is larger than the 100 MB limit.');

  const stored = await storeUpload({
    uploaderId: actor.userId,
    filename: file.name,
    declaredMime: file.type || 'application/octet-stream',
    data: new Uint8Array(await file.arrayBuffer()),
    purpose: 'upload',
  });

  if (!stored.ok) return fail(stored.message);

  return ok({
    fileId: stored.file.fileId,
    displayName: stored.file.displayName,
    byteSize: stored.file.byteSize,
    contentType: stored.file.serveContentType,
  });
}

export interface UploadResult {
  fileId: string;
  displayName: string;
  byteSize: number;
  contentType: string;
}

