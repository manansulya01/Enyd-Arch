import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { searchMembers } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Search members' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 64);
  const results = query.length >= 2 ? await searchMembers(query, actor.userId) : [];

  return (
    <PageShell title="Search" sub="Search discoverable member handles and display names. Private fields are never searched." wide>
      <form className="row row-3" action="/search" method="get" role="search">
        <label className="sr-only" htmlFor="member-search">Search members</label>
        <input id="member-search" className="input grow" name="q" type="search" maxLength={64} defaultValue={query} placeholder="Handle or display name…" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {query.length < 2 ? (
        <p className="t-meta">Enter at least two characters. Email addresses, legal names, and private profile fields are not searchable.</p>
      ) : results.length === 0 ? (
        <EmptyState glyph="⌕" title="No members found." body="Try another handle or display name. Some members choose not to appear in discovery." />
      ) : (
        <div className="archive-grid">
          {results.map((member) => (
            <Link key={member.userId} href={`/profile/${member.username}`} className="card card-pad card-interactive stack stack-2">
              <h2 className="t-heading">{member.displayName}</h2>
              <p className="t-meta">@{member.username} · {member.levelLabel}</p>
              {member.headline && <p className="t-small t-subtle">{member.headline}</p>}
              {member.region && <p className="t-meta">{member.region}</p>}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
