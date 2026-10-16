import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar } from '~/components/ui';
import { MEMBER_LEVELS } from '~/lib/domain';
import { memberDirectory } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = {
  title: 'The Registry',
  description: 'Find members of Enyd Arch by handle, name, and standing.',
};

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; level?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const levels = Object.keys(MEMBER_LEVELS);
  const level = levels.includes(params.level ?? '') ? params.level! : null;
  const members = await memberDirectory(actor.userId, { query: params.q ?? '', level, limit: 80 });

  return (
    <PageShell title="The Registry" sub="The people who make the Arch. Search by handle or name, and discover members by standing." wide>
      <form className="row row-4" action="/registry" method="get" role="search">
        <label className="sr-only" htmlFor="registry-search">Search members</label>
        <input id="registry-search" className="input input-search grow" type="search" name="q" defaultValue={params.q ?? ''} maxLength={60} placeholder="Search names and handles…" />
        <label className="sr-only" htmlFor="registry-level">Filter by standing</label>
        <select id="registry-level" className="input" name="level" defaultValue={level ?? ''}>
          <option value="">All standings</option>
          {Object.values(MEMBER_LEVELS).map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
        {(params.q || level) && <Link className="btn btn-ghost" href="/registry">Clear</Link>}
      </form>

      {members.length === 0 ? (
        <section className="panel panel-body">
          <h2>No members found</h2>
          <p className="t-small t-muted">Try a different name or standing filter. Members who are not discoverable, or who have blocked you or been blocked by you, are not listed.</p>
        </section>
      ) : (
        <div className="stack stack-3">
          {members.map((member) => (
            <Link key={member.userId} href={`/registry/${member.username}`} className="panel panel-body member-directory-card">
              <div className="row row-3">
                <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
                <div className="grow">
                  <h2>{member.displayName}</h2>
                  <p className="t-small t-muted">@{member.username} · {member.memberId}</p>
                  {member.headline && <p className="t-small">{member.headline}</p>}
                  <p className="t-meta">{member.levelLabel}{member.region ? ` · ${member.region}` : ''}</p>
                </div>
                <span className="t-meta" aria-hidden="true">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
