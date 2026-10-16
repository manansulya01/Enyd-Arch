import { NextResponse } from 'next/server';
import { currentActor } from '~/server/auth/session';
import { readObject } from '~/server/storage/driver';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Serves a stored object (avatar, cover, thumbnail) to signed-in members.
 * Objects are content-addressed by UUID; the bytes are never public.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentActor();
  if (!actor) {
    return new NextResponse('Sign in to view this.', {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404, headers: PRIVATE_HEADERS });
  }

  const object = await readObject(id);
  if (!object) {
    return new NextResponse('Not found', { status: 404, headers: PRIVATE_HEADERS });
  }

  return new NextResponse(Buffer.from(object.data) as unknown as BodyInit, {
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': object.contentType,
      'Content-Length': String(object.byteSize),
    },
  });
}
