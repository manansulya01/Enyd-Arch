import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { films, filmReviews, filmComments, users } from '~db/schema';
import { sessionCsrfToken } from '~/server/csrf';
import { relativeTime } from '~/lib/format';
import { submitFilmComment, submitFilmReview } from '~/server/actions/cinema-page-client';

export const metadata: Metadata = { title: 'Film details' };

function safeWatchUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function FilmPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [film] = await db.select().from(films).where(eq(films.slug, slug)).limit(1);
  if (!film) notFound();

  const [reviews, comments, csrf] = await Promise.all([
    db.select({
      id: filmReviews.id,
      rating: filmReviews.rating,
      body: filmReviews.body,
      spoilers: filmReviews.spoilers,
      createdAt: filmReviews.createdAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
      .from(filmReviews)
      .innerJoin(users, eq(users.id, filmReviews.authorId))
      .where(and(eq(filmReviews.filmId, film.id), isNull(filmReviews.removedAt)))
      .orderBy(desc(filmReviews.createdAt))
      .limit(40),
    db.select({
      id: filmComments.id,
      body: filmComments.body,
      sceneLabel: filmComments.sceneLabel,
      spoilers: filmComments.spoilers,
      createdAt: filmComments.createdAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
      .from(filmComments)
      .innerJoin(users, eq(users.id, filmComments.authorId))
      .where(and(eq(filmComments.filmId, film.id), eq(filmComments.status, 'published')))
      .orderBy(desc(filmComments.createdAt))
      .limit(60),
    sessionCsrfToken(),
  ]);
  const watchLinks = film.watchLinks.map((link) => ({ ...link, safeUrl: safeWatchUrl(link.url) })).filter((link) => link.safeUrl);

  return (
    <PageShell title={film.title} sub={[film.year, film.director, film.runtimeMinutes ? `${film.runtimeMinutes} min` : null].filter(Boolean).join(' · ')}>
      <div className="stack stack-5">
        <Link className="lnk" href="/cinema">← Back to Cinema</Link>
        <p className="prose">{film.synopsis}</p>
        {watchLinks.length > 0 && (
          <section className="card card-pad-md stack stack-2">
            <h2 className="t-section">Where to watch</h2>
            {watchLinks.map((link) => (
              <a className="lnk" href={link.safeUrl!} target="_blank" rel="noreferrer noopener" key={link.url}>
                {link.service}{link.note ? ` · ${link.note}` : ''}
              </a>
            ))}
          </section>
        )}
        <section className="card card-pad-md stack stack-3">
          <h2 className="t-section">Your review</h2>
          <form action={submitFilmReview} className="stack stack-2">
            <input type="hidden" name="__csrf" value={csrf} />
            <input type="hidden" name="filmId" value={film.id} />
            <label className="field">
              <span className="field-label">Rating (0–10)</span>
              <input className="input" type="number" min="0" max="10" step="0.5" name="rating" required />
            </label>
            <label className="field">
              <span className="field-label">Review</span>
              <textarea className="textarea-editor" name="body" rows={4} maxLength={4000} />
            </label>
            <label className="row row-2"><input type="checkbox" name="spoilers" /> <span>Contains spoilers</span></label>
            <button className="btn btn-primary btn-sm" type="submit">Save review</button>
          </form>
        </section>
        <section className="stack stack-3">
          <h2 className="t-section">Reviews</h2>
          {reviews.length === 0 ? <p className="t-small t-subtle">No reviews yet.</p> : reviews.map((review) => (
            <article className="card card-pad-md stack stack-2" key={review.id}>
              <div className="row row-between">
                <strong>{review.authorName} <span className="t-meta">@{review.authorUsername}</span></strong>
                <span className="badge badge-plain">{review.rating}/10</span>
              </div>
              {review.spoilers ? <details><summary>Contains spoilers</summary><p>{review.body}</p></details> : <p className="t-small">{review.body}</p>}
              <time className="t-meta" dateTime={review.createdAt.toISOString()}>{relativeTime(review.createdAt)}</time>
            </article>
          ))}
        </section>
        <section className="stack stack-3">
          <h2 className="t-section">Scene discussion</h2>
          <form action={submitFilmComment} className="card card-pad-md stack stack-2">
            <input type="hidden" name="__csrf" value={csrf} />
            <input type="hidden" name="filmId" value={film.id} />
            <label className="field"><span className="field-label">Scene (optional)</span><input className="input" name="sceneLabel" maxLength={120} /></label>
            <label className="field"><span className="field-label">Comment</span><textarea className="textarea-editor" name="body" rows={3} maxLength={2000} required /></label>
            <label className="row row-2"><input type="checkbox" name="spoilers" /> <span>Contains spoilers</span></label>
            <button className="btn btn-primary btn-sm" type="submit">Add comment</button>
          </form>
          {comments.map((comment) => (
            <article className="card card-pad-md stack stack-2" key={comment.id}>
              <strong>{comment.authorName} <span className="t-meta">@{comment.authorUsername}</span></strong>
              {comment.sceneLabel && <span className="t-meta">{comment.sceneLabel}</span>}
              {comment.spoilers ? <details><summary>Contains spoilers</summary><p>{comment.body}</p></details> : <p className="t-small">{comment.body}</p>}
              <time className="t-meta" dateTime={comment.createdAt.toISOString()}>{relativeTime(comment.createdAt)}</time>
            </article>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
