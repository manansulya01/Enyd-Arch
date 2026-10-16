import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { files } from '~db/schema';
import { currentActor } from '~/server/auth/session';
import { readObject } from '~/server/storage/driver';
import { resolveFileAccess } from '~/server/storage/uploads';

/**
 * Serves a stored file to a member who is entitled to it.
 *
 * The rule lives entirely server-side in resolveFileAccess: an upload is
 * reachable by its owner, and by members only once it is attached to something
 * published. URLs are unguessable UUIDs, but the UUID is never the
 * authorisation.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const actor = await currentActor();
  const decision = await resolveFileAccess(actor?.userId ?? null, id);

  if (decision.verdict !== 'ok') {
    return new NextResponse(
      decision.verdict === 'quarantined'
        ? 'This file is not available.'
        : 'You do not have access to this file.',
      {
        status: decision.verdict === 'missing' ? 404 : 403,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      },
    );
  }

  const [row] = await db
    .select({ storageObjectId: files.storageObjectId })
    .from(files)
    .where(eq(files.id, decision.fileId ?? id))
    .limit(1);
  if (!row?.storageObjectId) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const object = await readObject(row.storageObjectId);
  if (!object) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  // Only inert media renders in place; everything else is a download so a
  // hostile document can never execute against the app origin.
  const inline =
    /^(image\/(png|jpeg|gif|webp|avif|bmp)|audio\/|video\/|text\/(plain|markdown)|application\/pdf)$/.test(
      object.contentType,
    );
  const asDownload = new URL(request.url).searchParams.get('download') === '1' || !inline;

  return new NextResponse(Buffer.from(object.data) as unknown as BodyInit, {
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.byteSize),
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...(asDownload ? { 'Content-Disposition': 'attachment' } : {}),
    },
  });
}
