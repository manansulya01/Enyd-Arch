import { createServer } from 'node:http';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 3,
  idle_timeout: 5,
});
const db = drizzle(client, { schema });

const server = createServer(async (_req, res) => {
  const started = Date.now();
  try {
    // Readiness is intentionally minimal: do not disclose member counts,
    // message volume, moderation queue depth, or database error details.
    await db.execute(sql`select 1`);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(JSON.stringify({ ok: true, latencyMs: Date.now() - started }));
  } catch {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(JSON.stringify({ ok: false, error: 'dependency_unavailable' }));
  }
});

server.listen(Number(process.env.PORT ?? 3002), '127.0.0.1', () => {
  // Bind to loopback by default; expose through a private health-check network
  // only when the deployment explicitly changes the bind address.
  process.stdout.write(`Enyd Arch health probe on 127.0.0.1:${process.env.PORT ?? 3002}\\n`);
});

async function shutdown() {
  server.close();
  await client.end();
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
