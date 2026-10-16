import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { ConnectionRequestCard } from '~/components/connections/connection-request-card';
import { requireOnboarded } from '~/server/guard';
import { connectionRequestInbox, matchesFor } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Connections' };

export default async function ConnectionsPage() {
  const { actor } = await requireOnboarded();
  const [requests, matches, csrfToken] = await Promise.all([
    connectionRequestInbox(actor.userId),
    matchesFor(actor.userId, 'accepted'),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="Connections" sub="Relationships begin with consent. Manage requests and the people you have connected with." wide>
      <section className="stack stack-3">
        <div className="row row-between"><h2 className="section-heading">Incoming requests</h2><Link className="btn btn-ghost btn-sm" href="/registry">Find members</Link></div>
        {requests.length === 0 ? <div className="panel panel-body"><h3>No pending requests</h3><p className="t-small t-muted">When someone requests a friendship or collaboration, it will appear here.</p></div> : requests.map((request) => (
          <ConnectionRequestCard key={request.id} request={{ ...request, createdAt: request.createdAt.toISOString() }} csrfToken={csrfToken} />
        ))}
      </section>
      <section className="stack stack-3">
        <h2 className="section-heading">Your connections</h2>
        {matches.length === 0 ? <div className="panel panel-body"><h3>Your network starts with a conversation</h3><p className="t-small t-muted">Visit the Registry and send a friendship or collaboration request to someone who has opted in.</p><Link className="btn btn-primary" href="/registry">Open the Registry</Link></div> : matches.map((match) => (
          <article className="panel panel-body row row-3" key={match.id}>
            <div className="grow"><h3><Link href={'/registry/' + match.partner.username}>{match.partner.displayName}</Link></h3><p className="t-meta">{match.mode.replaceAll('_', ' ')} · {match.sharedInterestCount} shared interests</p></div>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
