import type { Metadata } from 'next';
import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '~db';
import { films } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'The Cinema' };

export default async function CinemaPage() {
  await requireOnboarded();
  const catalogue = await db.select({
    id: films.id,
    slug: films.slug,
    title: films.title,
    year: films.year,
    director: films.director,
    synopsis: films.synopsis,
    runtimeMinutes: films.runtimeMinutes,
    cineStatus: films.cineStatus,
  }).from(films).orderBy(desc(films.createdAt)).limit(100);

  return (
    <PageShell title="The Cinema" sub="Films, reviews, and legitimate watch links." wide actions={<Link className="btn btn-primary btn-sm" href="/cinema/new">Add a film</Link>}>
      {catalogue.length === 0 ? (
        <EmptyState glyph="◐" title="No films in the catalogue." body="Add a film and include an official availability link if you know one." action={<Link className="btn btn-primary" href="/cinema/new">Add a film</Link>} />
      ) : (
        <div className="archive-grid">
          {catalogue.map((film) => (
            <Link href={`/cinema/${film.slug}`} key={film.id} className="card card-pad card-interactive stack stack-2">
              <span className="badge">{film.cineStatus.replaceAll('_', ' ')}</span>
              <h2 className="t-heading">{film.title}{film.year ? ` (${film.year})` : ''}</h2>
              {film.director && <p className="t-meta">Directed by {film.director}</p>}
              <p className="t-small t-subtle">{film.synopsis || 'No synopsis added yet.'}</p>
              {film.runtimeMinutes && <p className="t-meta">{film.runtimeMinutes} minutes</p>}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
