import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '~db';
import { blocks, connectionRequests, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { ConnectionResponseButton } from '~/components/connections/connection-controls';
import { matchesFor } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Connections' };

export default async function ConnectionsPage() {
  const { actor } = await requireOnboarded();
  const [matches, incoming, outgoing] = await Promise.all([
    matchesFor(actor.userId, 'accepted'),
    db.select({
      id: connectionRequests.id,
      mode: connectionRequests.mode,
      note: connectionRequests.note,
      createdAt: connectionRequests.createdAt,
      username: users.username,
      displayName: users.displayName,
    }).from(connectionRequests)
      .innerJoin(users, eq(users.id, connectionRequests.fromUserId))
      .where(and(
        eq(connectionRequests.toUserId, actor.userId),
        eq(connectionRequests.state, 'pending'),
        sql`not exists (select 1 from ${blocks} b where (b.blocker_id = ${actor.userId} and b.blocked_id = ${connectionRequests.fromUserId}) or (b.blocker_id = ${connectionRequests.fromUserId} and b.blocked_id = ${actor.userId}))`,
      ))
      .orderBy(desc(connectionRequests.createdAt)).limit(100),
    db.select({
      id: connectionRequests.id,
      mode: connectionRequests.mode,
      note: connectionRequests.note,
      createdAt: connectionRequests.createdAt,
      username: users.username,
      displayName: users.displayName,
    }).from(connectionRequests)
      .innerJoin(users, eq(users.id, connectionRequests.toUserId))
      .where(and(
        eq(connectionRequests.fromUserId, actor.userId),
        eq(connectionRequests.state, 'pending'),
        sql`not exists (select 1 from ${blocks} b where (b.blocker_id = ${actor.userId} and b.blocked_id = ${connectionRequests.toUserId}) or (b.blocker_id = ${connectionRequests.toUserId} and b.blocked_id = ${actor.userId}))`,
      ))
      .orderBy(desc(connectionRequests.createdAt)).limit(100),
  ]);

  return (
    <PageShell title="Connections" sub="You decide who gets closer." wide>
      <div className="stack stack-5">
        <section className="stack stack-3">
          <h2 className="t-heading">Your connections</h2>
          {matches.length === 0 ? (
            <EmptyState glyph="◇" title="No connections yet." body="Visit a member profile to send an opt-in friendship or collaboration request. Dating is available only when both adults explicitly opt in." />
          ) : (
            <div className="archive-grid">
              {matches.filter((match) => match.partner).map((match) => (
                <article key={match.id} className="card card-pad stack stack-2">
                  <h3 className="t-heading">{match.partner.displayName}</h3>
                  <p className="t-meta">@{match.partner.username} · {match.mode}</p>
                  <Link className="btn btn-secondary btn-sm" href={`/profile/${match.partner.username}`}>View profile</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="stack stack-3">
          <h2 className="t-heading">Requests to you</h2>
          {incoming.length === 0 ? <p className="t-subtle">No pending requests.</p> : incoming.map((request) => (
            <article className="card card-pad stack stack-2" key={request.id}>
              <div className="row row-between"><strong>{request.displayName}</strong><span className="badge">{request.mode}</span></div>
              <p className="t-meta">@{request.username} · {request.createdAt.toLocaleDateString()}</p>
              {request.note && <p className="t-body">{request.note}</p>}
              <div className="row row-wrap">
                <ConnectionResponseButton requestId={request.id} accept />
                <ConnectionResponseButton requestId={request.id} accept={false} />
              </div>
            </article>
          ))}
        </section>

        <section className="stack stack-3">
          <h2 className="t-heading">Requests you sent</h2>
          {outgoing.length === 0 ? <p className="t-subtle">No pending outgoing requests.</p> : outgoing.map((request) => (
            <article className="card card-pad stack stack-2" key={request.id}>
              <div className="row row-between"><strong>{request.displayName}</strong><span className="badge">{request.mode}</span></div>
              <p className="t-meta">@{request.username} · waiting for their decision</p>
              {request.note && <p className="t-body">{request.note}</p>}
            </article>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
