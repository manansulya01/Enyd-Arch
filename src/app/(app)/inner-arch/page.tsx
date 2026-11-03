import type { Metadata } from 'next';
import { desc, isNull, eq } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireCapability } from '~/server/guard';
import { db } from '~db';
import { innerArchMembers, users } from '~db/schema';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'The Inner Arch' };

export default async function InnerArchPage() {
  await requireCapability('inner_arch');
  const members = await db.select({
    userId: innerArchMembers.userId,
    standing: innerArchMembers.standing,
    focus: innerArchMembers.focus,
    joinedAt: innerArchMembers.joinedAt,
    username: users.username,
    displayName: users.displayName,
  })
    .from(innerArchMembers)
    .innerJoin(users, eq(users.id, innerArchMembers.userId))
    .where(isNull(innerArchMembers.removedAt))
    .orderBy(desc(innerArchMembers.joinedAt))
    .limit(100);

  return (
    <PageShell title="The Inner Arch" sub="A private council for stewardship, governance and care.">
      {members.length === 0 ? (
        <EmptyState glyph="✦" title="No active members." body="The council roster is currently empty." />
      ) : (
        <div className="stack stack-3">
          {members.map((member) => (
            <article className="card card-pad-md stack stack-2" key={member.userId}>
              <div className="row row-between">
                <div className="stack stack-1">
                  <strong>{member.displayName}</strong>
                  <span className="t-meta">@{member.username}</span>
                </div>
                <span className="badge badge-plain">{member.standing}</span>
              </div>
              {member.focus && <p className="t-small t-subtle">{member.focus}</p>}
              <span className="t-meta">Joined {relativeTime(member.joinedAt)}</span>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
