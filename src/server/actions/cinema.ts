'use server';

/** The Cinema — films, watchlists, watch nights. Legitimate links only. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { filmComments, filmReviews, films, watchEvents, watchlistItems, watchlists } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { slugify } from '~/lib/format';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';

export async function addFilm(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const title = String(formData.get('title') ?? '').trim().slice(0, 180);
  const yearRaw = Number(formData.get('year') ?? 0);
  const director = String(formData.get('director') ?? '').trim().slice(0, 120);
  const synopsis = String(formData.get('synopsis') ?? '').trim().slice(0, 4000);
  const watchUrl = String(formData.get('watchUrl') ?? '').trim();
  const runtimeRaw = Number(formData.get('runtimeMinutes') ?? 0);

  if (title.length < 1) return fail('Give the film a title.', { title: ['Required.'] });

  let watchLinks: Array<{ service: string; url: string }> = [];
  if (watchUrl) {
    try {
      const url = new URL(watchUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return fail('The watch link must be a normal web address.', { watchUrl: ['Invalid.'] });
      }
      watchLinks = [{ service: url.hostname.replace(/^www\./, ''), url: watchUrl }];
    } catch {
      return fail('That watch link is not a valid address.', { watchUrl: ['Invalid.'] });
    }
  }

  const base = slugify(title) || 'film';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const [taken] = await db.select({ id: films.id }).from(films).where(eq(films.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(films)
    .values({
      slug,
      title,
      year: yearRaw > 1800 && yearRaw < 2200 ? yearRaw : null,
      director: director || null,
      synopsis,
      watchLinks,
      runtimeMinutes: runtimeRaw > 0 ? runtimeRaw : null,
    })
    .returning({ slug: films.slug });

  revalidatePath('/cinema');
  return ok({ slug: created!.slug });
}

export async function reviewFilm(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const filmId = String(formData.get('filmId') ?? '');
  const rating = Number(formData.get('rating') ?? 0);
  const body = String(formData.get('body') ?? '').trim().slice(0, 4000);
  const spoilers = formData.get('spoilers') === 'on';

  if (!filmId || !(rating >= 0 && rating <= 10)) return fail('A rating from 0 to 10 is required.');

  const [film] = await db.select({ slug: films.slug }).from(films).where(eq(films.id, filmId)).limit(1);
  if (!film) return fail('That film is not available.');

  await db
    .insert(filmReviews)
    .values({ filmId, authorId: actor.userId, rating, body, spoilers })
    .onConflictDoUpdate({
      target: [filmReviews.filmId, filmReviews.authorId],
      set: { rating, body, spoilers, updatedAt: new Date() },
    });

  revalidatePath(`/cinema/${film.slug}`);
  return ok();
}

export async function commentOnFilm(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const filmId = String(formData.get('filmId') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  const sceneLabel = String(formData.get('sceneLabel') ?? '').trim().slice(0, 120);
  const spoilers = formData.get('spoilers') === 'on';
  if (!filmId || !body) return fail('Write something first.');

  const [film] = await db.select({ slug: films.slug }).from(films).where(eq(films.id, filmId)).limit(1);
  if (!film) return fail('That film is not available.');

  await db.insert(filmComments).values({
    filmId,
    authorId: actor.userId,
    body,
    sceneLabel: sceneLabel || null,
    spoilers,
  });

  revalidatePath(`/cinema/${film.slug}`);
  return ok();
}

export async function toggleWatchlist(filmId: string, csrf: string): Promise<ActionResult<{ added: boolean }>> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  let [list] = await db.select().from(watchlists).where(eq(watchlists.userId, actor.userId)).limit(1);
  if (!list) {
    [list] = await db
      .insert(watchlists)
      .values({ userId: actor.userId, name: 'My Watchlist' })
      .returning();
  }

  const existing = await db
    .select({})
    .from(watchlistItems)
    .where(and(eq(watchlistItems.watchlistId, list!.id), eq(watchlistItems.filmId, filmId)))
    .limit(1);

  if (existing[0]) {
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, list!.id), eq(watchlistItems.filmId, filmId)));
    return ok({ added: false });
  }

  await db.insert(watchlistItems).values({ watchlistId: list!.id, filmId });
  return ok({ added: true });
}

export async function createWatchEvent(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const filmId = String(formData.get('filmId') ?? '');
  const startsAtRaw = String(formData.get('startsAt') ?? '');
  const roomUrl = String(formData.get('roomUrl') ?? '').trim();
  const roomProvider = String(formData.get('roomProvider') ?? '').trim().slice(0, 48);

  const startsAt = new Date(startsAtRaw);
  if (!filmId || Number.isNaN(startsAt.getTime())) {
    return fail('Choose a film and a valid time.');
  }
  if (roomUrl) {
    try {
      const url = new URL(roomUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return fail('The room link must be a normal web address.', { roomUrl: ['Invalid.'] });
      }
    } catch {
      return fail('That room link is not a valid address.', { roomUrl: ['Invalid.'] });
    }
  }

  const [film] = await db.select({ slug: films.slug, title: films.title }).from(films).where(eq(films.id, filmId)).limit(1);
  if (!film) return fail('That film is not available.');

  const base = slugify(`${film.title}-watch-night`) || 'watch-night';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const [taken] = await db.select({ id: watchEvents.id }).from(watchEvents).where(eq(watchEvents.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }

  await db.insert(watchEvents).values({
    slug,
    filmId,
    hostId: actor.userId,
    startsAt,
    roomUrl: roomUrl || null,
    roomProvider: roomProvider || null,
  });

  revalidatePath('/cinema');
  return ok({ slug });
}
