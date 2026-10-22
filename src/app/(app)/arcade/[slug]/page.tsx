import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState } from '~/components/ui';
import { GamePlayer } from '~/components/arcade/player';
import { GameComments } from '~/components/arcade/comments';
import { RatingWidget } from '~/components/arcade/rating';
import { gameBySlug, getGameComments } from '~/server/queries';
import { mintPlayGrant } from '~/server/arcade/play-grant';
import { requireOnboarded } from '~/server/guard';
import { formatCount, starString } from '~/lib/format';
import { CsrfField } from '~/components/shell/csrf-field';
import { sessionCsrfToken } from '~/server/csrf';
import { db, schema } from '~db';
import { eq, desc } from 'drizzle-orm';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: 'Arcade' };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;

  const game = await gameBySlug(slug, actor.userId);
  if (!game) notFound();

  const grant = game.status === 'approved' ? await mintPlayGrant(game.id) : { ok: false };
  const stars = starString(game.rating);
  const [gameComments, csrfToken] = await Promise.all([
    getGameComments(game.id, actor.userId),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title={game.title} sub={game.tagline}>
      <div className="page-split">
        <div className="stack stack-5">
          <Link className="lnk" href="/arcade">
            ← Back to the Arcade
          </Link>

          {game.status !== 'approved' && (
            <p className="notice notice-info" role="status">
              <span className="notice-glyph" aria-hidden="true">
                ◌
              </span>
              <span className="notice-body">
                This submission is <strong>{game.status.replace('_', ' ')}</strong> and is visible
                only to you. It becomes playable once a reviewer approves it.
              </span>
            </p>
          )}

          <GamePlayer gameId={game.id} title={game.title} grantUrl={grant.url ?? null} grantError={grant.ok ? null : grant.reason ?? 'Unknown error'} />

          <article className="card card-pad-lg stack stack-3">
            <div className="row row-wrap row-between">
              <RatingWidget gameId={game.id} myStars={game.myStars} rating={game.rating} ratingCount={game.ratingCount} csrfToken={csrfToken} />
              <span className="t-meta">
                {formatCount(game.playCount)} plays · {game.ratingCount} rating
                {game.ratingCount === 1 ? '' : 's'} · {game.commentCount} comments
              </span>
            </div>
            <p className="prose">{game.description}</p>
            {game.controls && (
              <div className="card card-inset">
                <span className="t-label">Controls</span>
                <p className="t-small">{game.controls}</p>
              </div>
            )}
            {game.tags.length > 0 && (
              <div className="shared-tags">
                {game.tags.map((tag) => (
                  <span className="tag-link" key={tag}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="row row-4">
              <Avatar displayName={game.creator.displayName} avatarUrl={game.creator.avatarUrl} size="sm" />
              <span className="t-small">
                Built by{' '}
                <Link className="lnk" href={`/network/${game.creator.username}`}>
                  {game.creator.displayName}
                </Link>{' '}
                <span className="t-meta">
                  @{game.creator.username} · {game.creator.memberId}
                </span>
              </span>
            </div>
          </article>

          <GameComments gameId={game.id} comments={gameComments} csrfToken={csrfToken} />
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">How the sandbox works</span>
            </div>
            <div className="panel-body stack stack-2">
              <p className="t-small t-subtle">
                <strong aria-hidden="true">◈</strong> Games run on a different origin from this
                application. They cannot read your session, call this site's APIs, load remote
                assets, or navigate away. You are always able to leave.
              </p>
              <p className="t-small t-subtle">
                Packages are unpacked, filtered, and rescanned before publication. Network calls,
                cookies and top-level navigation are refused at review time.
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Rating</span>
            </div>
            <div className="panel-body">
              <span className="rating-big">
                <span className="rating-big-value">{game.rating ? game.rating.toFixed(1) : '—'}</span>
                <span className="stars">
                  <span className="t-accent">{stars.filled}</span>
                  <span className="t-subtle">{stars.empty}</span>
                </span>
              </span>
            </div>
          </div>
          {game.commentCount === 0 && (
            <EmptyState glyph="❝" title="No comments yet." body="Tell the creator what you thought." />
          )}
        </aside>
      </div>
      <CsrfField />
    </PageShell>
  );
}
