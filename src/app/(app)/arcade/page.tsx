import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState } from '~/components/ui';
import { arcadeGames } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { GAME_GENRES } from '~/lib/domain';
import { formatCount, starString } from '~/lib/format';

export const metadata: Metadata = { title: 'The Arcade' };

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; sort?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const { genre, sort } = await searchParams;
  const sortKey = sort === 'recent' || sort === 'rating' ? sort : 'popular';

  const games = await arcadeGames({
    viewerId: actor.userId,
    genre: genre ?? null,
    sort: sortKey,
    limit: 36,
  });

  return (
    <PageShell
      title="The Arcade"
      sub="Small games built by the people who play them. Every one runs in an isolated sandbox with no network and no access to this site."
      wide
      actions={
        <Link className="btn btn-primary btn-sm" href="/arcade/new">
          Submit a game
        </Link>
      }
    >
      <div className="row row-wrap row-between" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="btn-group" role="group" aria-label="Filter by genre">
          <Link className={`btn btn-sm ${!genre ? 'btn-primary' : 'btn-ghost'}`} href="/arcade">
            All
          </Link>
          {GAME_GENRES.map((entry) => (
            <Link
              key={entry.value}
              className={`btn btn-sm ${genre === entry.value ? 'btn-primary' : 'btn-ghost'}`}
              href={`/arcade?genre=${entry.value}`}
            >
              {entry.label}
            </Link>
          ))}
        </div>
        <div className="btn-group" role="group" aria-label="Sort games">
          {(['popular', 'recent', 'rating'] as const).map((option) => (
            <Link
              key={option}
              className={`btn btn-sm ${sortKey === option ? 'btn-primary' : 'btn-ghost'}`}
              href={`/arcade?sort=${option}${genre ? `&genre=${genre}` : ''}`}
            >
              {option === 'popular' ? 'Most played' : option === 'recent' ? 'Newest' : 'Best rated'}
            </Link>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <EmptyState
          glyph="◱"
          title="No games here yet."
          body="The Arcade fills up when members write small games and submit them. Yours could be the first."
          action={
            <Link className="btn btn-primary" href="/arcade/new">
              Submit a game
            </Link>
          }
        />
      ) : (
        <div className="arcade-grid">
          {games.map((game) => {
            const stars = starString(game.rating);
            return (
              <article className="game-card card" key={game.id}>
                <div className="game-thumb" aria-hidden="true">
                  <span className="act-glyph">{genreGlyph(game.genre)}</span>
                  <span className="t-meta">{genreLabel(game.genre)}</span>
                </div>
                <div className="card-body stack stack-2">
                  <h2 className="game-title">
                    <Link href={`/arcade/${game.slug}`}>{game.title}</Link>
                  </h2>
                  <p className="game-tagline">{game.tagline}</p>
                  <div className="row row-4">
                    <Avatar displayName={game.creator.displayName} avatarUrl={game.creator.avatarUrl} size="xs" />
                    <span className="t-meta truncate">
                      {game.creator.displayName} · {game.creator.memberId}
                    </span>
                  </div>
                </div>
                <div className="game-foot">
                  <span className="stars" title={`${game.rating.toFixed(1)} of 5`}>
                    <span className="t-accent">{stars.filled}</span>
                    <span className="t-subtle">{stars.empty}</span>
                  </span>
                  <span className="t-meta">{formatCount(game.playCount)} plays</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function genreLabel(genre: string): string {
  return GAME_GENRES.find((entry) => entry.value === genre)?.label ?? genre;
}

function genreGlyph(genre: string): string {
  switch (genre) {
    case 'puzzle':
      return '◈';
    case 'arcade':
      return '◱';
    case 'strategy':
      return '⌘';
    case 'narrative':
      return '❝';
    case 'platformer':
      return '↑';
    case 'experimental':
      return '✦';
    case 'card':
      return '❒';
    case 'art':
      return '❖';
    default:
      return '◇';
  }
}
