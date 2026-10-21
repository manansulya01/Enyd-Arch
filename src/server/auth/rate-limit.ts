import 'server-only';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '~db';
import { rateLimits } from '~db/schema';
import { clientIp } from '../crypto';

/**
 * Fixed-window rate limiting kept in Postgres.
 *
 * Chosen over an in-process map so the limit survives a deploy and holds when
 * the app runs on more than one instance. `acquire()` increments inside a
 * single statement, so two concurrent requests cannot both read the pre-window
 * count.
 */

export interface RateLimitRule {
  /** Window length in seconds */
  windowSeconds: number;
  /** Maximum number of requests permitted in the window */
  max: number;
}

export const RATE_LIMITS = {
  /** Sign-in attempts — also keyed per account so one user cannot be brute-forced */
  signIn: { windowSeconds: 900, max: 8 },
  /** Registration attempts from one device */
  register: { windowSeconds: 3600, max: 5 },
  passwordReset: { windowSeconds: 3600, max: 4 },
  /** Device credential creation */
  deviceEnroll: { windowSeconds: 3600, max: 6 },
  /** Outbound member messages */
  message: { windowSeconds: 60, max: 30 },
  post: { windowSeconds: 60, max: 12 },
  comment: { windowSeconds: 60, max: 25 },
  upload: { windowSeconds: 3600, max: 40 },
  /** Arcade game submissions — deliberately slow to prevent package spam */
  gameSubmit: { windowSeconds: 86400, max: 6 },
  connectionRequest: { windowSeconds: 3600, max: 30 },
  /** Anything an authenticated member can trigger at volume */
  write: { windowSeconds: 60, max: 90 },
  search: { windowSeconds: 60, max: 60 },
  report: { windowSeconds: 3600, max: 20 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

/**
 * Increments the counter for a window in one statement, so two concurrent
 * requests can never both observe the pre-window count. The window resets when
 * the stored expiry has passed.
 */
function incrementSql(key: string, windowSeconds: number) {
  return sql`
    insert into ${rateLimits} (key, count, window_start, expires_at)
    values (${key}, 1, now(), now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case
        when ${rateLimits.expiresAt} <= now() then 1
        else ${rateLimits.count} + 1
      end,
      window_start = case
        when ${rateLimits.expiresAt} <= now() then now()
        else ${rateLimits.windowStart}
      end,
      expires_at = case
        when ${rateLimits.expiresAt} <= now() then now() + make_interval(secs => ${windowSeconds})
        else ${rateLimits.expiresAt}
      end
    returning count, expires_at
  `;
}

export async function acquire(
  name: RateLimitName,
  identifier: string,
  override?: Partial<RateLimitRule>,
): Promise<RateLimitResult> {
  const rule = { ...RATE_LIMITS[name], ...override };
  const bucket = Math.floor(Date.now() / (rule.windowSeconds * 1000));
  const key = `${name}:${identifier}:${bucket}`;

  const rows = (await db.execute<{ count: number; expires_at: Date }>(
    incrementSql(key, rule.windowSeconds),
  )) as unknown as Array<{ count: number; expires_at: Date }>;

  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((new Date(row?.expires_at ?? Date.now()).getTime() - Date.now()) / 1000),
  );

  return {
    allowed: count <= rule.max,
    remaining: Math.max(0, rule.max - count),
    retryAfterSeconds,
    limit: rule.max,
  };
}

/** Consumes a unit without incrementing — used for pre-flight checks. */
export async function check(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const bucket = Math.floor(Date.now() / (rule.windowSeconds * 1000));
  const rows = await db
    .select({ count: rateLimits.count, expiresAt: rateLimits.expiresAt })
    .from(rateLimits)
    .where(eq(rateLimits.key, `${name}:${identifier}:${bucket}`));

  const count = rows[0]?.count ?? 0;
  return {
    allowed: count < rule.max,
    remaining: Math.max(0, rule.max - count),
    retryAfterSeconds: rows[0]?.expiresAt
      ? Math.max(0, Math.ceil((rows[0].expiresAt.getTime() - Date.now()) / 1000))
      : 0,
    limit: rule.max,
  };
}

/** Convenience wrapper: throws nothing, returns a message instead. */
export async function gate(
  name: RateLimitName,
  identifier: string,
  scope: 'ip' | 'user' = 'ip',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await acquire(name, `${scope}:${identifier}`);
  if (result.allowed) return { ok: true };
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return {
    ok: false,
    message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  };
}

export function ipBucket(): string {
  return clientIp();
}

/** Housekeeping; call from a scheduled job. */
export async function purgeExpired(): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(and(lt(rateLimits.expiresAt, new Date()), gt(rateLimits.expiresAt, new Date(0))))
    .returning({ key: rateLimits.key });
  return deleted.length;
}