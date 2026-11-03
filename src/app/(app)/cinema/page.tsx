import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { films, filmReviews, watchlists, watchlistItems } from '~db/schema';
import { sessionCsrfToken } from '~/server/csrf';
import { toggleFilmWatchlist } from '~/server/actions/cinema-client';

export const metadata: Metadata = { title: 'The Cinema' };

export default async function CinemaPage() {
  const { actor } = await requireOnboarded();
  const [items, csrf] = await Promise.all([
    db.select({
      id: films.id,
      slug: films.slug,
      title: films.title,
      year: films.year,
      director: films.director,
      synopsis: films.synopsis,
      cineStatus: films.cineStatus,
      runtimeMinutes: films.runtimeMinutes,
      watchLinks: films.watchLinks,
      rating: sql<number>`coalesce(avg(${filmReviews.rating}), 0)::float`,
      ratingCount: sql<number>`count(${filmReviews.id})::int`,
      inWatchlist: sql<boolean>`exists (
        select 1 from ${watchlistItems} wi
        inner join ${watchlists} wl on wl.id = wi.watchlist_id
        where wl.user_id = ${actor.userId} and wi.film_id = ${films.id}
      )`,
    })
      .from(films)
      .leftJoin(filmReviews, and(eq(filmReviews.filmId, films.id), isNull(filmReviews.removedAt)))
      .groupBy(films.id)
      .orderBy(desc(films.createdAt))
      .limit(48),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="The Cinema" sub="A shared shelf of films, reviews and watch nights.">
      {items.length === 0 ? (
        <EmptyState glyph="◐" title="The screen is waiting." body="Films added to the community catalogue will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((film) => (
            <article className="card card-pad-md stack stack-3" key={film.id}>
              <div className="row row-between">
                <span className="t-meta">{film.cineStatus}</span>
                <span className="t-meta">{film.year ?? 'Year unknown'}</span>
              </div>
              <div className="stack stack-1">
                <h2 className="t-section"><Link href={`/cinema/${film.slug}`}>{film.title}</Link></h2>
                {film.director && <p className="t-small t-subtle">Directed by {film.director}</p>}
                <p className="t-small">{film.synopsis}</p>
              </div>
              <div className="row row-between">
                <span className="t-meta">{film.rating.toFixed(1)}/10 · {film.ratingCount} reviews</span>
                {film.runtimeMinutes && <span className="t-meta">{film.runtimeMinutes} min</span>}
              </div>
              <div className="row row-between">
                <form action={toggleFilmWatchlist}>
                  <input type="hidden" name="__csrf" value={csrf} />
                  <input type="hidden" name="filmId" value={film.id} />
                  <button className="btn btn-sm btn-ghost" type="submit">{film.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}</button>
                </form>
                {film.watchLinks.length > 0 && (
                  <a className="lnk" href={film.watchLinks[0].url} target="_blank" rel="noreferrer noopener">Where to watch</a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
