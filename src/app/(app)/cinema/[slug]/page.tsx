import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '~db';
import { filmComments, filmReviews, films, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { FilmCommentForm, FilmReviewForm, WatchlistButton } from '~/components/cinema/cinema-forms';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Film' };

export default async function FilmDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireOnboarded();
  const { slug } = await params;
  const [film] = await db.select({
    id: films.id,
    slug: films.slug,
    title: films.title,
    year: films.year,
    director: films.director,
    synopsis: films.synopsis,
    watchLinks: films.watchLinks,
    coverObjectId: films.coverObjectId,
    cineStatus: films.cineStatus,
    runtimeMinutes: films.runtimeMinutes,
  }).from(films).where(eq(films.slug, slug)).limit(1);
  if (!film) notFound();

  const [reviews, comments] = await Promise.all([
    db.select({
      id: filmReviews.id,
      rating: filmReviews.rating,
      body: filmReviews.body,
      spoilers: filmReviews.spoilers,
      createdAt: filmReviews.createdAt,
      username: users.username,
      displayName: users.displayName,
    }).from(filmReviews)
      .innerJoin(users, eq(users.id, filmReviews.authorId))
      .where(and(eq(filmReviews.filmId, film.id), isNull(filmReviews.removedAt)))
      .orderBy(desc(filmReviews.updatedAt)).limit(100),
    db.select({
      id: filmComments.id,
      body: filmComments.body,
      sceneLabel: filmComments.sceneLabel,
      spoilers: filmComments.spoilers,
      createdAt: filmComments.createdAt,
      username: users.username,
      displayName: users.displayName,
    }).from(filmComments)
      .innerJoin(users, eq(users.id, filmComments.authorId))
      .where(and(eq(filmComments.filmId, film.id), eq(filmComments.status, 'published'), isNull(filmComments.removedAt)))
      .orderBy(desc(filmComments.createdAt)).limit(100),
  ]);

  return (
    <PageShell title={film.title} sub={[film.year, film.director].filter(Boolean).join(' · ')} actions={<Link className="btn btn-ghost btn-sm" href="/cinema">Back to Cinema</Link>} wide>
      <div className="page-split">
        <div className="stack stack-4">
          <article className="panel panel-body stack stack-3">
            <span className="badge">{film.cineStatus.replaceAll('_', ' ')}</span>
            <p className="t-body">{film.synopsis || 'No synopsis has been added.'}</p>
            {film.runtimeMinutes && <p className="t-meta">{film.runtimeMinutes} minutes</p>}
            {film.watchLinks.filter((link) => /^https:\/\//i.test(link.url)).map((link) => (
              <a key={link.url} className="btn btn-secondary" href={link.url} target="_blank" rel="noopener noreferrer">
                Watch via {link.service}
              </a>
            ))}
            <WatchlistButton filmId={film.id} />
          </article>

          <section className="stack stack-3">
            <h2 className="t-heading">Reviews</h2>
            {reviews.length === 0 ? <p className="t-subtle">No reviews yet.</p> : reviews.map((review) => (
              <article key={review.id} className="card card-pad stack stack-2">
                <div className="row row-between"><strong>{review.displayName}</strong><span className="badge">{review.rating}/10</span></div>
                {review.spoilers ? <details><summary>Spoiler review — open to read</summary><p className="t-body">{review.body}</p></details> : <p className="t-body">{review.body}</p>}
                <p className="t-meta">@{review.username} · {review.createdAt.toLocaleDateString()}</p>
              </article>
            ))}
          </section>

          <section className="stack stack-3">
            <h2 className="t-heading">Scene discussion</h2>
            {comments.map((comment) => (
              <article key={comment.id} className="card card-pad stack stack-2">
                {comment.sceneLabel && <h3 className="t-label">{comment.sceneLabel}</h3>}
                {comment.spoilers ? <details><summary>Spoiler comment — open to read</summary><p className="t-body">{comment.body}</p></details> : <p className="t-body">{comment.body}</p>}
                <p className="t-meta">@{comment.username} · {comment.createdAt.toLocaleDateString()}</p>
              </article>
            ))}
          </section>
        </div>
        <aside className="stack stack-4">
          <FilmReviewForm filmId={film.id} csrf={<CsrfField />} />
          <FilmCommentForm filmId={film.id} csrf={<CsrfField />} />
        </aside>
      </div>
    </PageShell>
  );
}
