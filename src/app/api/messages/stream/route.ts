import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~db';
import { conversationMembers, messages } from '~db/schema';
import { acquire } from '~/server/auth/rate-limit';
import { isUuid } from '~/server/auth/identifiers';
import { requireOnboarded } from '~/server/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const encoder = new TextEncoder();
const STREAM_WINDOW_MS = 25_000;
const POLL_INTERVAL_MS = 3_000;

function parseCursor(value: string | null): { createdAt: Date; id: string } {
  const match = value?.match(/^(\d{10,13}):([0-9a-f-]{36})$/i);
  if (!match) return { createdAt: new Date(), id: '00000000-0000-0000-0000-000000000000' };
  const createdAt = new Date(Number(match[1]));
  if (!Number.isFinite(createdAt.getTime())) {
    return { createdAt: new Date(), id: '00000000-0000-0000-0000-000000000000' };
  }
  return { createdAt, id: match[2]! };
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function GET(request: Request) {
  const { actor } = await requireOnboarded();
  const conversationId = new URL(request.url).searchParams.get('conversation');
  if (!isUuid(conversationId)) {
    return NextResponse.json({ error: 'Conversation not available.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const [membership] = await db.select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, actor.userId),
      isNull(conversationMembers.removedAt),
    )).limit(1);
  if (!membership) {
    return NextResponse.json({ error: 'Conversation not available.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const limiter = await acquire('stream', actor.userId);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Too many live connections. Reconnect shortly.' },
      { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(limiter.retryAfterSeconds) } },
    );
  }

  const cursor = parseCursor(request.headers.get('last-event-id'));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* client disconnected */ }
      };
      request.signal.addEventListener('abort', close, { once: true });

      void (async () => {
        const startedAt = Date.now();
        let lastCreatedAt = cursor.createdAt;
        let lastId = cursor.id;
        try {
          while (!closed && !request.signal.aborted && Date.now() - startedAt < STREAM_WINDOW_MS) {
            const [activeMembership] = await db.select({ conversationId: conversationMembers.conversationId })
              .from(conversationMembers)
              .where(and(
                eq(conversationMembers.conversationId, conversationId),
                eq(conversationMembers.userId, actor.userId),
                isNull(conversationMembers.removedAt),
              )).limit(1);
            if (!activeMembership) break;

            const rows = await db.select({
              id: messages.id,
              senderId: messages.senderId,
              createdAt: messages.createdAt,
            }).from(messages)
              .where(and(
                eq(messages.conversationId, conversationId),
                isNull(messages.removedAt),
                or(
                  gt(messages.createdAt, lastCreatedAt),
                  and(eq(messages.createdAt, lastCreatedAt), gt(messages.id, lastId)),
                ),
              ))
              .orderBy(asc(messages.createdAt), asc(messages.id))
              .limit(50);

            for (const row of rows) {
              if (closed || request.signal.aborted) break;
              const eventId = `${row.createdAt.getTime()}:${row.id}`;
              if (row.senderId !== actor.userId) {
                controller.enqueue(encoder.encode(
                  `id: ${eventId}\nevent: message-created\ndata: ${JSON.stringify({ id: row.id })}\n\n`,
                ));
              }
              lastCreatedAt = row.createdAt;
              lastId = row.id;
            }
            if (rows.length === 50) continue;
            await pause(POLL_INTERVAL_MS);
          }
        } catch {
          // Do not send message contents or database errors over the stream.
        } finally {
          request.signal.removeEventListener('abort', close);
          close();
        }
      })();
    },
    cancel() {
      // The request abort signal closes the producer loop on disconnect.
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
