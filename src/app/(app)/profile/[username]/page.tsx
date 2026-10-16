import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { ConnectionRequestForm } from '~/components/connections/connection-controls';
import { memberByUsername, profileActivity } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Member profile' };

export default async function MemberProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { actor } = await requireOnboarded();
  const { username } = await params;
  const member = await memberByUsername(username, actor.userId);
  if (!member) notFound();

  const activity = await profileActivity(member.userId);
  const ownProfile = member.userId === actor.userId;
  const stats = [
    ['Posts', activity.posts],
    ['Comments', activity.comments],
    ...(member.showArchiveContributions ? [['Archive contributions', activity.archiveContributions] as const] : []),
    ...(member.showCreations ? [['Gallery pieces', activity.galleryPieces] as const, ['Games', activity.games] as const] : []),
    ['Projects', activity.projects],
    ['Events hosted', activity.eventsHosted],
    ['Connections', activity.connections],
  ] as const;

  return (
    <PageShell title={member.displayName} sub={`@${member.username} · ${member.levelLabel}`} actions={ownProfile ? <Link className="btn btn-primary btn-sm" href="/settings">Edit settings</Link> : <Link className="btn btn-ghost btn-sm" href="/connections">Connections</Link>}>
      <div className="page-split">
        <section className="stack stack-4">
          <article className="panel panel-body stack stack-3">
            {member.headline && <p className="t-lede">{member.headline}</p>}
            <dl className="stack stack-2">
              <div><dt className="t-label">Member number</dt><dd>{member.memberId}</dd></div>
              <div><dt className="t-label">Member since</dt><dd>{member.joinedAt.toLocaleDateString()}</dd></div>
              {member.ageBandLabel && <div><dt className="t-label">Age band</dt><dd>{member.ageBandLabel}</dd></div>}
              {member.region && <div><dt className="t-label">Region</dt><dd>{member.region}</dd></div>}
            </dl>
          </article>
          {member.showActivity && <section className="stack stack-3">
            <h2 className="t-heading">Activity</h2>
            <div className="archive-grid">
              {stats.map(([label, value]) => (
                <article className="card card-pad stack stack-1" key={label}>
                  <span className="t-meta">{label}</span>
                  <strong className="t-display-sm">{value}</strong>
                </article>
              ))}
            </div>
          </section>}
        </section>
        {!ownProfile && <aside><ConnectionRequestForm toUserId={member.userId} /></aside>}
      </div>
    </PageShell>
  );
}
