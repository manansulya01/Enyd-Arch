import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { WatchlistButton } from '~/components/cinema/watchlist-button';
import { requireOnboarded } from '~/server/guard';
import { cinemaFilms } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [film] = await cinemaFilms(actor.userId, { slug, limit: 1 });
  return film ? { title: film.title, description: film.synopsis } : { title: 'Film not found' };
}

export default async function CinemaFilmPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [films, csrfToken] = await Promise.all([cinemaFilms(actor.userId, { slug, limit: 1 }), sessionCsrfToken()]);
  const film = films[0];
  if (!film) notFound();

  return (
    <PageShell title={film.title} sub={[film.year, film.director].filter(Boolean).join(' · ')} wide>
      <article className="panel panel-body stack stack-3">
        {film.coverUrl && <img src={film.coverUrl} alt="" className="film-hero" />}
        <p>{film.synopsis || 'No synopsis has been added yet.'}</p>
        <p className="t-meta">{film.cineStatus.replaceAll('_', ' ')}{film.runtimeMinutes ? ' · ' + film.runtimeMinutes + ' minutes' : ''}</p>
        <p className="t-meta">{film.averageRating === null ? 'No ratings yet' : 'Community rating: ' + film.averageRating.toFixed(1) + ' / 10'} · {film.reviewCount} reviews</p>
        <WatchlistButton filmId={film.id} initial={film.inWatchlist} csrfToken={csrfToken} />
        <section className="stack stack-2">
          <h2 className="section-heading">Official availability</h2>
          {film.watchLinks.length === 0 ? <p className="t-small t-muted">No official availability link has been added yet.</p> : film.watchLinks.map((link) => (
            <a className="row row-between panel panel-body" href={link.url} target="_blank" rel="noopener noreferrer" key={link.url}>
              <span><strong>{link.service}</strong>{link.note && <span className="t-small t-muted"> · {link.note}</span>}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </section>
        <Link className="btn btn-ghost" href="/cinema">Back to Cinema</Link>
      </article>
    </PageShell>
  );
}
