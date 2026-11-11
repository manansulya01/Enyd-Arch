import { and, asc, eq, gt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '~db';
import { notifications } from '~db/schema';
import { requireOnboarded } from '~/server/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const encoder = new TextEncoder();
const STREAM_WINDOW_MS = 25_000;
const POLL_INTERVAL_MS = 1_500;
const HEARTBEAT_MS = 10_000;

function parseCursor(value: string | null): { createdAt: Date; id: string } {
  const match = value?.match(/^(\d{10,13}):([0-9a-f-]{36})$/i);
  if (!match) {
    return { createdAt: new Date(), id: '00000000-0000-0000-0000-000000000000' };
  }
  const timestamp = Number(match[1]);
  const createdAt = new Date(timestamp);
  if (!Number.isFinite(createdAt.getTime())) {
    return { createdAt: new Date(), id: '00000000-0000-0000-0000-000000000000' };
  }
  return { createdAt, id: match[2]! };
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function GET(request: Request) {
  const { actor } = await requireOnboarded();
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
        let lastHeartbeat = Date.now();

        try {
          while (!closed && !request.signal.aborted && Date.now() - startedAt < STREAM_WINDOW_MS) {
            const rows = await db.select({
              id: notifications.id,
              kind: notifications.kind,
              title: notifications.title,
              body: notifications.body,
              href: notifications.href,
              createdAt: notifications.createdAt,
            }).from(notifications)
              .where(and(
                eq(notifications.userId, actor.userId),
                or(
                  gt(notifications.createdAt, lastCreatedAt),
                  and(
                    eq(notifications.createdAt, lastCreatedAt),
                    gt(notifications.id, lastId),
                  ),
                ),
              ))
              .orderBy(asc(notifications.createdAt), asc(notifications.id))
              .limit(50);

            for (const row of rows) {
              if (closed || request.signal.aborted) break;
              const timestamp = row.createdAt.getTime();
              const eventId = `${timestamp}:${row.id}`;
              const data = JSON.stringify({
                id: row.id,
                kind: row.kind,
                title: row.title,
                body: row.body,
                href: row.href,
                createdAt: row.createdAt.toISOString(),
              });
              controller.enqueue(encoder.encode(`id: ${eventId}\nevent: notification\ndata: ${data}\n\n`));
              lastCreatedAt = row.createdAt;
              lastId = row.id;
            }

            if (rows.length === 0 && Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
              lastHeartbeat = Date.now();
            }
            if (rows.length === 50) continue;
            await pause(POLL_INTERVAL_MS);
          }
        } catch {
          if (!closed && !request.signal.aborted) {
            try { controller.enqueue(encoder.encode('event: stream-error\ndata: {"error":"temporarily_unavailable"}\n\n')); } catch { /* disconnected */ }
          }
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
