import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { WatchlistButton } from '~/components/cinema/watchlist-button';
import { requireOnboarded } from '~/server/guard';
import { cinemaFilms } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Cinema' };

export default async function CinemaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const [films, csrfToken] = await Promise.all([
    cinemaFilms(actor.userId, { query: params.q ?? '', limit: 80 }),
    sessionCsrfToken(),
  ]);
  return (
    <PageShell title="Cinema" sub="A film catalogue, thoughtful discussion, and watchlists. Availability links point to official sources." wide>
      <form className="row row-3" action="/cinema" method="get" role="search">
        <label className="sr-only" htmlFor="film-search">Search films</label>
        <input className="input input-search grow" id="film-search" name="q" type="search" maxLength={80} defaultValue={params.q ?? ''} placeholder="Search title or director…" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <section className="stack stack-3">
        {films.length === 0 ? <div className="panel panel-body"><h2>No films found</h2><p className="t-small t-muted">Try another title, or check back as the catalogue grows.</p></div> : films.map((film) => (
          <article className="panel panel-body" key={film.id}>
            <div className="row row-3">
              {film.coverUrl && <img src={film.coverUrl} alt="" width={88} height={128} className="film-cover" />}
              <div className="grow">
                <p className="t-meta">{film.year ?? 'Year unknown'}{film.director ? ' · ' + film.director : ''}{film.runtimeMinutes ? ' · ' + film.runtimeMinutes + ' min' : ''}</p>
                <h2><Link href={'/cinema/' + film.slug}>{film.title}</Link></h2>
                <p className="t-small t-muted">{film.synopsis}</p>
                <p className="t-meta">{film.averageRating === null ? 'No ratings yet' : film.averageRating.toFixed(1) + ' / 10'} · {film.reviewCount} reviews</p>
                {film.watchLinks.length > 0 && <div className="row row-wrap row-2">{film.watchLinks.map((link) => <a className="btn btn-ghost btn-sm" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.service}</a>)}</div>}
              </div>
              <WatchlistButton filmId={film.id} initial={film.inWatchlist} csrfToken={csrfToken} />
            </div>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
