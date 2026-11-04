import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { memberByUsername, profileActivity } from '~/server/queries';
import { relativeTime } from '~/lib/format';
import { and, eq } from 'drizzle-orm';
import { db } from '~db';
import { blocks } from '~db/schema';
import { sessionCsrfToken } from '~/server/csrf';
import { blockMember, unblockMember } from '~/server/actions/connections-client';

export const metadata: Metadata = { title: 'Member profile' };

export default async function MemberProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { actor } = await requireOnboarded();
  const { username } = await params;
  const member = await memberByUsername(username, actor.userId);
  if (!member) notFound();
  const [activity, csrf, blockRows] = await Promise.all([
    profileActivity(member.userId, actor.userId),
    sessionCsrfToken(),
    member.userId === actor.userId
      ? Promise.resolve([])
      : db.select({ id: blocks.id }).from(blocks).where(and(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, member.userId))).limit(1),
  ]);
  const blockedByMe = blockRows.length > 0;

  return (
    <PageShell title={member.displayName} sub={`@${member.username} · ${member.memberId}`}>
      <div className="stack stack-5">
        {member.headline && <p className="t-lead">{member.headline}</p>}
        <div className="card card-pad-lg stack stack-2">
          <div className="row row-between">
            <span className="t-label">Member standing</span>
            <span className="badge badge-plain">{member.levelLabel}</span>
          </div>
          <p className="t-small t-subtle">Joined {relativeTime(member.joinedAt)}</p>
          {member.ageBandLabel && <p className="t-small t-subtle">{member.ageBandLabel}</p>}
          {member.region && <p className="t-small t-subtle">{member.region}</p>}
        </div>
        <section className="stack stack-3">
          <h2 className="t-section">Activity</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Posts', activity.posts],
              ['Replies', activity.comments],
              ['Archive', activity.archiveContributions],
              ['Games', activity.games],
              ['Gallery', activity.galleryPieces],
              ['Projects', activity.projects],
              ['Events hosted', activity.eventsHosted],
              ['Connections', activity.connections],
            ].map(([label, value]) => (
              <div className="card card-pad-md stack stack-1" key={String(label)}>
                <strong className="t-section">{value}</strong>
                <span className="t-meta">{label}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="row row-wrap row-2">
          <Link className="btn btn-ghost btn-sm" href="/connections">Connections</Link>
          <Link className="btn btn-ghost btn-sm" href="/commons">The Commons</Link>
          <Link className="btn btn-ghost btn-sm" href="/gallery">Gallery</Link>
          {member.userId !== actor.userId && (
            <form action={blockedByMe ? unblockMember : blockMember}>
              <input type="hidden" name="__csrf" value={csrf} />
              <input type="hidden" name="userId" value={member.userId} />
              <button className="btn btn-ghost btn-sm" type="submit">{blockedByMe ? 'Unblock member' : 'Block member'}</button>
            </form>
          )}
          {member.userId === actor.userId && <Link className="btn btn-primary btn-sm" href="/settings">Account settings</Link>}
        </div>
      </div>
    </PageShell>
  );
}
