/**
 * Member-number allocation.
 *
 * Membership numbers are sequential and never reused, which is the point: an
 * ARCH number is meant to feel like a thing that was issued rather than an
 * account that was created. Allocation goes through a Postgres sequence so two
 * concurrent registrations cannot collide on it.
 */

import { sql } from 'drizzle-orm';
import { db } from '~db';

/**
 * Draws the next membership number.
 *
 * The sequence is owned by `db/bootstrap.ts` rather than declared in the schema,
 * because drizzle-kit would otherwise try to manage its ownership and fight the
 * trigger-based timestamp setup on every push.
 */
export async function nextMemberNumber(): Promise<number> {
  const rows = await db.execute<{ next: number }>(
    sql`select nextval('member_id_seq')::int as next`,
  );
  const value = Number((rows as unknown as Array<{ next: number }>)[0]?.next ?? 0);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('member_id_seq is unavailable; run `pnpm db:bootstrap`.');
  }
  return value;
}