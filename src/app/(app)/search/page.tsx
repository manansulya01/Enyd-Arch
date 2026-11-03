import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { memberByUsername } from '~/server/queries';

export const metadata: Metadata = { title: 'Search members' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await requireOnboarded();
  const { q = '' } = await searchParams;
  const query = q.trim().replace(/^@/, '').slice(0, 24);
  const member = query ? await memberByUsername(query, actor.userId) : null;

  return (
    <PageShell title="Search" sub="Find members by username.">
      <form className="row row-2" action="/search" method="get">
        <label className="sr-only" htmlFor="member-search">Username</label>
        <input className="input" id="member-search" name="q" placeholder="Search by @username" defaultValue={q} maxLength={25} />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {query && !member ? (
        <EmptyState glyph="⌕" title="No visible member found." body="Check the username or the member’s discovery settings." />
      ) : member ? (
        <Link className="card card-pad-lg stack stack-2" href={`/members/${encodeURIComponent(member.username)}`}>
          <strong>{member.displayName}</strong>
          <span className="t-meta">@{member.username} · {member.memberId}</span>
          {member.headline && <span className="t-small t-subtle">{member.headline}</span>}
          <span className="lnk">View profile</span>
        </Link>
      ) : (
        <EmptyState glyph="⌕" title="Search the Arch." body="Enter a member’s username to find their visible profile." />
      )}
    </PageShell>
  );
}
