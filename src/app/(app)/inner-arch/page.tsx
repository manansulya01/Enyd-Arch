import type { Metadata } from 'next';
import { desc, and, eq, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { GovernanceVoteControls } from '~/components/inner-arch/governance-vote-controls';
import { db } from '~db';
import { governanceProposals, governanceVotes, innerArchMembers } from '~db/schema';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Inner Arch' };

export default async function InnerArchPage() {
  const { actor } = await requireOnboarded();
  const [membership] = await db.select({ standing: innerArchMembers.standing })
    .from(innerArchMembers)
    .where(and(eq(innerArchMembers.userId, actor.userId), isNull(innerArchMembers.removedAt)))
    .limit(1);
  if (!membership) redirect('/home');

  const [proposals, csrfToken] = await Promise.all([
    db.select({
      id: governanceProposals.id,
      title: governanceProposals.title,
      slug: governanceProposals.slug,
      body: governanceProposals.body,
      opensAt: governanceProposals.opensAt,
      closesAt: governanceProposals.closesAt,
      result: governanceProposals.result,
      upvoterCount: governanceProposals.upvoterCount,
      downvoterCount: governanceProposals.downvoterCount,
      myVote: sql<number | null>`(select v.value from ${governanceVotes} v where v.proposal_id = ${governanceProposals.id} and v.user_id = ${actor.userId})`,
    }).from(governanceProposals).orderBy(desc(governanceProposals.createdAt)).limit(60),
    sessionCsrfToken(),
  ]);

  const now = new Date();
  return (
    <PageShell title="Inner Arch" sub={`Governance chamber · standing: ${membership.standing}`} wide>
      <p className="t-small t-muted">Proposals are visible to active Inner Arch members. Each member may cast one vote per proposal and change it while voting is open.</p>
      <section className="stack stack-3">
        {proposals.length === 0 ? <div className="panel panel-body"><h2>No proposals are open</h2><p className="t-small t-muted">New governance proposals will appear here.</p></div> : proposals.map((proposal) => {
          const open = proposal.result === 'open' && proposal.opensAt <= now && proposal.closesAt > now;
          return (
            <article className="panel panel-body stack stack-3" key={proposal.id}>
              <div className="row row-between"><p className="t-meta">{proposal.result.replaceAll('_', ' ')} · closes {proposal.closesAt.toLocaleString()}</p><span className="t-meta">{proposal.upvoterCount} for · {proposal.downvoterCount} against</span></div>
              <h2>{proposal.title}</h2>
              <p className="prose-content">{proposal.body}</p>
              <GovernanceVoteControls proposalId={proposal.id} csrfToken={csrfToken} myVote={proposal.myVote} open={open} />
            </article>
          );
        })}
      </section>
    </PageShell>
  );
}
