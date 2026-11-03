import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { connectionRequestsFor, matchesFor } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';
import { relativeTime } from '~/lib/format';
import { respondToConnectionRequest, unmatchConnection } from '~/server/actions/connections-client';

export const metadata: Metadata = { title: 'Connections' };

export default async function ConnectionsPage() {
  const { actor } = await requireOnboarded();
  const [requests, matches, csrf] = await Promise.all([
    connectionRequestsFor(actor.userId),
    matchesFor(actor.userId, 'accepted'),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="Connections" sub="Relationships are opt-in, mutual, and always reversible.">
      <div className="stack stack-6">
        <section className="stack stack-3">
          <div className="row row-between">
            <h2 className="t-section">Requests for you</h2>
            <span className="t-meta">{requests.length} pending</span>
          </div>
          {requests.length === 0 ? (
            <EmptyState glyph="◇" title="No pending requests." body="When someone asks to connect, you can review it here before anything becomes mutual." />
          ) : (
            <div className="stack stack-3">
              {requests.map((request) => (
                <article className="card card-pad-md stack stack-3" key={request.id}>
                  <div className="row row-between">
                    <div className="stack stack-1">
                      <strong>{request.sender.displayName}</strong>
                      <span className="t-meta">@{request.sender.username} · {request.mode}</span>
                    </div>
                    <time className="t-meta" dateTime={request.createdAt.toISOString()}>{relativeTime(request.createdAt)}</time>
                  </div>
                  {request.note && <p className="t-small t-subtle">{request.note}</p>}
                  <div className="row row-2">
                    <form action={respondToConnectionRequest}>
                      <input type="hidden" name="__csrf" value={csrf} />
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <button className="btn btn-primary btn-sm" type="submit">Accept</button>
                    </form>
                    <form action={respondToConnectionRequest}>
                      <input type="hidden" name="__csrf" value={csrf} />
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="btn btn-ghost btn-sm" type="submit">Decline</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="stack stack-3">
          <div className="row row-between">
            <h2 className="t-section">Your connections</h2>
            <span className="t-meta">{matches.length} mutual</span>
          </div>
          {matches.length === 0 ? (
            <EmptyState glyph="◈" title="Your circle is still open." body="Connections appear here after both members agree to a request." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {matches.map((match) => (
                <article className="card card-pad-md stack stack-2" key={match.id}>
                  <strong>{match.partner.displayName}</strong>
                  <span className="t-meta">@{match.partner.username} · {match.mode}</span>
                  <span className="t-meta">Connected {relativeTime(match.createdAt)}</span>
                  <form action={unmatchConnection}>
                    <input type="hidden" name="__csrf" value={csrf} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <button className="btn btn-ghost btn-sm" type="submit">Unmatch</button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
