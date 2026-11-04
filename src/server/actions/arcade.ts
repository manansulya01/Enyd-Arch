'use server';

/**
 * The Arcade
 *
 * Game submissions flow: upload zip → validate → scan for hostile patterns →
 * repack → record verdict → held for staff review → only approved packages are
 * ever playable. Players never touch the raw upload.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  gameComments,
  gamePlays,
  gameRatings,
  gameTags,
  games,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { slugify } from '~/lib/format';
import { randomUUID } from 'node:crypto';
import { isUuid } from '~/server/auth/identifiers';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { putObject } from '~/server/storage/driver';
import { processGamePackage } from '~/server/storage/game-package';
import { scanBytes } from '~/server/storage/scanner';

export async function submitGame(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('gameSubmit', actor.userId);
  if (!limiter.allowed) return fail('You have submitted a lot today. Rest, then try again tomorrow.');

  const title = String(formData.get('title') ?? '').trim().slice(0, 140);
  const tagline = String(formData.get('tagline') ?? '').trim().slice(0, 200);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000);
  const genre = String(formData.get('genre') ?? 'other').slice(0, 40);
  const controls = String(formData.get('controls') ?? '').trim().slice(0, 2000);
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((tag) => slugify(tag).slice(0, 32))
    .filter(Boolean)
    .slice(0, 8);

  if (title.length < 2) return fail('Give the game a title.', { title: ['Too short.'] });

  const file = formData.get('package');
  if (!(file instanceof File) || file.size === 0) {
    return fail('Attach the game package (.zip).', { package: ['Required.'] });
  }
  if (file.size > 20 * 1024 * 1024) {
    return fail('Packages must be under 20 MB.');
  }

  const raw = new Uint8Array(await file.arrayBuffer());
  const scan = await scanBytes(raw);
  if (scan.verdict === 'infected') {
    return fail('That package was refused by the safety scan.');
  }

  const processed = processGamePackage(raw);
  const slug = await uniqueSlug(title);

  if (!processed.ok || !processed.packageBytes) {
    // Record the rejection so the submitter sees the findings, but store
    // nothing executable.
    await db.insert(games).values({
      slug,
      title,
      tagline,
      description,
      genre,
      controls,
      creatorId: actor.userId,
      status: 'rejected',
      scanReport: { findings: processed.report.findings, blocked: true },
      reviewNote: processed.message ?? null,
    });
    return ok({ slug });
  }

  const stored = await putObject({
    purpose: 'game_package',
    id: randomUUID(),
    extension: 'zip',
    data: processed.packageBytes,
    contentType: 'application/zip',
  });

  await db.insert(games).values({
    slug,
    title,
    tagline,
    description,
    genre,
    controls,
    creatorId: actor.userId,
    status: 'approved',
    entryFile: processed.entryFile ?? 'index.html',
    packageObjectId: stored.id,
    packageChecksum: processed.checksum,
    scanReport: { findings: processed.report.findings, blocked: false },
  });

  const [created] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1);
  for (const tag of tags) {
    await db.insert(gameTags).values({ gameId: created!.id, tag }).onConflictDoNothing();
  }

  revalidatePath('/arcade');
  return ok({ slug });
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || 'game';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const [taken] = await db.select({ id: games.id }).from(games).where(eq(games.slug, slug)).limit(1);
    if (!taken) return slug;
    slug = `${base}-${attempt + 1}`;
  }
  return `${base}-${Date.now()}`;
}

export async function rateGame(gameId: string, stars: number): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!isUuid(gameId)) return fail('That game is not available.');
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail('Stars must be 1–5.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const [game] = await db
    .select({ id: games.id, status: games.status })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.status, 'approved'), isNull(games.removedAt)))
    .limit(1);
  if (!game) return fail('That game is not available.');

  const existing = await db
    .select({ stars: gameRatings.stars })
    .from(gameRatings)
    .where(and(eq(gameRatings.gameId, gameId), eq(gameRatings.userId, actor.userId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(gameRatings)
      .set({ stars })
      .where(and(eq(gameRatings.gameId, gameId), eq(gameRatings.userId, actor.userId)));
    await db
      .update(games)
      .set({ ratingSum: sql`${games.ratingSum} - ${existing[0].stars} + ${stars}` })
      .where(eq(games.id, gameId));
  } else {
    await db.insert(gameRatings).values({ gameId, userId: actor.userId, stars });
    await db
      .update(games)
      .set({ ratingSum: sql`${games.ratingSum} + ${stars}`, ratingCount: sql`${games.ratingCount} + 1` })
      .where(eq(games.id, gameId));
  }

  revalidatePath('/arcade');
  return ok();
}

export async function commentOnGame(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const gameId = String(formData.get('gameId') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  const parentIdValue = formData.get('parentId');
  const parentId = typeof parentIdValue === 'string' ? parentIdValue : null;
  if (!isUuid(gameId) || (parentId !== null && !isUuid(parentId))) return fail('That game or reply is not available.');
  if (!body) return fail('Write something first.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const [game] = await db
    .select({ id: games.id, slug: games.slug })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.status, 'approved'), isNull(games.removedAt)))
    .limit(1);
  if (!game) return fail('That game is not available.');

  if (parentId) {
    const [parent] = await db
      .select({ id: gameComments.id })
      .from(gameComments)
      .where(and(
        eq(gameComments.id, parentId),
        eq(gameComments.gameId, gameId),
        eq(gameComments.status, 'published'),
        isNull(gameComments.removedAt),
      ))
      .limit(1);
    if (!parent) return fail('That reply is no longer available.');
  }

  await db.insert(gameComments).values({ gameId, authorId: actor.userId, body, parentId });
  await db
    .update(games)
    .set({ commentCount: sql`${games.commentCount} + 1` })
    .where(eq(games.id, gameId));

  revalidatePath(`/arcade/${game.slug}`);
  return ok();
}

export async function recordPlay(gameId: string, seconds: number): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) return fail('Sign in to record play.');
  if (!isUuid(gameId) || !Number.isFinite(seconds) || seconds < 3) return fail('That play is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.status, 'approved'), isNull(games.removedAt)))
    .limit(1);
  if (!game) return fail('That game is not available.');
  const bounded = Math.min(Math.max(0, Math.floor(seconds)), 24 * 3600);

  await db.insert(gamePlays).values({ gameId, userId: actor.userId, seconds: bounded });
  await db
    .update(games)
    .set({ playCount: sql`${games.playCount} + 1` })
    .where(eq(games.id, gameId));
  return ok();
}
