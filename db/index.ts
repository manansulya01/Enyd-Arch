import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { __enydSql?: postgres.Sql };

/**
 * A single pooled connection per process. `postgres` multiplexes over a socket
 * pool; prepared statements are disabled for pgbouncer compatibility.
 */
export const sql =
  globalForDb.__enydSql ??
  postgres(process.env.DATABASE_URL ?? '', {
    max: Number(process.env.DB_POOL_MAX ?? 12),
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__enydSql = sql;

export const db = drizzle(sql, { schema, casing: 'snake_case' });

export type DB = typeof db;
export { schema };