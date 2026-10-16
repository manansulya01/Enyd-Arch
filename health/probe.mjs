import { createServer } from 'node:http';
import { once } from 'node:events';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const client = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
const db = drizzle(client, { schema });

const server = createServer(async (req, res) => {
  const started = Date.now();
  let status = 200;
  let body = '';

  try {
    // Realtime queue depth — the SSE notifier drains this.
    const [queue] = await db.execute(sql`
      select count(*)::int as depth from realtime_queue where delivered_at is null
    `);
    const queueDepth = Number((queue as unknown as Array<{ depth: number }>)[0]?.depth ?? 0);

    const [counts] = await db.execute(sql`
      select
        (select count(*)::int from users where status = 'active') as members,
        (select count(*)::int from posts where status = 'published' and removed_at is null) as posts,
        (select count(*)::int from archive_objects where removed_at is null) as objects,
        (select count(*)::int from games where status = 'approved') as games,
        (select count(*)::int from messages where removed_at is null) as messages,
        (select count(*)::int from reports where state not in ('resolved','dismissed')) as open_reports
    `);
    const row = (counts as unknown as Array<Record<string, number>>)[0] ?? {};

    body = JSON.stringify({
      ok: true,
      queueDepth,
      latencyMs: Date.now() - started,
      members: Number(row.members ?? 0),
      posts: Number(row.posts ?? 0),
      archiveObjects: Number(row.objects ?? 0),
      approvedGames: Number(row.games ?? 0),
      messages: Number(row.messages ?? 0),
      openReports: Number(row.open_reports ?? 0),
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (error) {
    status = 503;
    body = JSON.stringify({
      ok: false,
      error: (error as Error).message,
      latencyMs: Date.now() - started,
    });
  }

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
});

server.listen(Number(process.env.PORT ?? 3002), () => {
  console.log(`Enyd Arch health probe on :${process.env.PORT ?? 3002}`);
});

process.on('SIGINT', async () => {
  await client.end();
  process.exit(0);
});

void once;