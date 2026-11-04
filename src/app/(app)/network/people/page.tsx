import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar, EmptyState } from '~/components/ui';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { memberFollowLists } from '~/server/queries';

export const metadata: Metadata = {
  title: 'Following and followers',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function NetworkPeoplePage() {
  const { actor } = await requireOnboarded();
  const { following, followers } = await memberFollowLists(actor.userId);

  return (
    <PageShell title="Your network" sub="People you follow and members who follow you. Only profiles visible to you are listed.">
      <div className="stack stack-5" style={{ maxWidth: 900 }}>
        <div className="row row-wrap">
          <Link className="btn btn-ghost btn-sm" href="/network">Back to Network</Link>
          <span className="tag">{following.length} following shown</span>
          <span className="tag">{followers.length} followers shown</span>
        </div>
        <section className="stack stack-3" aria-labelledby="following-heading">
          <h2 id="following-heading">Following</h2>
          {following.length === 0 ? (
            <EmptyState title="You aren't following anyone yet." body="Visit member profiles or the Network to find people to follow." />
          ) : (
            <div className="stack stack-2">
              {following.map((member) => (
                <Link className="card card-pad row row-start" href={`/members/${member.username}`} key={member.userId}>
                  <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} />
                  <span className="stack stack-1">
                    <strong>{member.displayName}</strong>
                    <span className="t-small t-meta">@{member.username} · {member.memberId}</span>
                    {member.headline && <span className="t-small t-subtle">{member.headline}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="stack stack-3" aria-labelledby="followers-heading">
          <h2 id="followers-heading">Followers</h2>
          {followers.length === 0 ? (
            <EmptyState title="No visible followers yet." body="When members follow you, they will appear here if their profiles are discoverable to you." />
          ) : (
            <div className="stack stack-2">
              {followers.map((member) => (
                <Link className="card card-pad row row-start" href={`/members/${member.username}`} key={member.userId}>
                  <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} />
                  <span className="stack stack-1">
                    <strong>{member.displayName}</strong>
                    <span className="t-small t-meta">@{member.username} · {member.memberId}</span>
                    {member.headline && <span className="t-small t-subtle">{member.headline}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
