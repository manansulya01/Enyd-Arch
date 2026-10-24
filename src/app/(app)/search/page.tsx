import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { arcadeGames, archiveObjects, memberDirectory } from '~/server/queries';

export const metadata: Metadata = {
  title: 'Search the Arch',
  description: 'Search members, Archive entries, and community-made games.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 100);
  const [members, archives, games] = query.length >= 2
    ? await Promise.all([
        memberDirectory(actor.userId, { query, limit: 8 }),
        archiveObjects({ viewerId: actor.userId, query, limit: 8 }),
        arcadeGames({ viewerId: actor.userId, query, limit: 8 }),
      ])
    : [[], [], []];

  const hasResults = members.length + archives.length + games.length > 0;

  return (
    <PageShell title="Search the Arch" sub="Find members, knowledge, and games." wide>
      <form className="row row-3" action="/search" method="get" role="search">
        <label className="sr-only" htmlFor="arch-search">Search the Arch</label>
        <input
          id="arch-search"
          className="input input-search grow"
          type="search"
          name="q"
          defaultValue={query}
          maxLength={100}
          placeholder="Search members, Archive entries, games…"
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {!query ? (
        <section className="panel panel-body">
          <h2>Search privately</h2>
          <p className="t-small t-muted">Results follow your visibility and block settings. Enter at least two characters to search.</p>
        </section>
      ) : query.length < 2 ? (
        <section className="panel panel-body">
          <p className="t-small t-muted">Enter at least two characters to search.</p>
        </section>
      ) : !hasResults ? (
        <EmptyState title="No results found" body="Try another phrase or a shorter search." />
      ) : (
        <div className="stack stack-5">
          {members.length > 0 && (
            <section className="stack stack-2">
              <h2>Members</h2>
              {members.map((member) => (
                <Link key={member.userId} href={`/members/${member.username}`} className="panel panel-body">
                  <div className="row row-3">
                    <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
                    <div className="grow">
                      <h3>{member.displayName}</h3>
                      <p className="t-small t-muted">@{member.username} · {member.memberId}</p>
                      {member.headline && <p className="t-small">{member.headline}</p>}
                    </div>
                    <span className="t-meta" aria-hidden="true">View →</span>
                  </div>
                </Link>
              ))}
            </section>
          )}

          {archives.length > 0 && (
            <section className="stack stack-2">
              <h2>The Archive</h2>
              {archives.map((item) => (
                <Link key={item.id} href={`/archive/${item.slug}`} className="panel panel-body">
                  <h3>{item.title}</h3>
                  <p className="t-small t-muted">{item.category} · ARC-{String(item.catalogueNumber).padStart(6, '0')}</p>
                  {item.description && <p className="t-small">{item.description.slice(0, 240)}</p>}
                </Link>
              ))}
            </section>
          )}

          {games.length > 0 && (
            <section className="stack stack-2">
              <h2>The Arcade</h2>
              {games.map((game) => (
                <Link key={game.id} href={`/arcade/${game.slug}`} className="panel panel-body">
                  <h3>{game.title}</h3>
                  {game.description && <p className="t-small">{game.description.slice(0, 240)}</p>}
                </Link>
              ))}
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
