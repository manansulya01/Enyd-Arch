import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, EmptyState } from '~/components/ui';
import { PageShell } from '~/components/ui/page-shell';
import { absoluteDate } from '~/lib/format';
import { requireOnboarded } from '~/server/guard';
import { feed, memberByUsername, memberProfileDetails } from '~/server/queries';

export const metadata: Metadata = {
  title: 'Member profile',
  description: 'A member profile on Enyd Arch.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { actor } = await requireOnboarded();
  const { username } = await params;
  const member = await memberByUsername(username, actor.userId);
  if (!member) notFound();

  const details = await memberProfileDetails(member.userId, actor.userId);
  if (!details) notFound();

  const recentPosts = details.showActivity
    ? await feed({ viewerId: actor.userId, authorId: member.userId, sort: 'recent', limit: 8 })
    : [];

  const isSelf = actor.userId === member.userId;
  const visibleLinks = details.showCreations
    ? details.links
        .map((item) => ({ label: item.label.trim().slice(0, 80), url: safeExternalUrl(item.url) }))
        .filter((item): item is { label: string; url: string } => Boolean(item.label && item.url))
    : [];

  return (
    <PageShell
      title={member.displayName}
      sub={`@${member.username} · ${member.memberId}`}
      actions={isSelf ? <Link className="btn btn-ghost btn-sm" href="/settings/privacy">Privacy settings</Link> : undefined}
    >
      <div className="stack stack-5" style={{ maxWidth: 820 }}>
        <section className="card card-pad-lg stack stack-4">
          <div className="row row-start">
            <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
            <div className="stack stack-1">
              <h1>{member.displayName}</h1>
              {member.headline && <p className="t-subtle">{member.headline}</p>}
              <p className="t-small t-meta">{member.levelLabel} · Member since {absoluteDate(member.joinedAt)}</p>
              {member.region && <p className="t-small t-subtle">{member.region}</p>}
            </div>
          </div>

          {details.bio && <p className="prose t-base">{details.bio}</p>}
          {details.pronouns && <p className="t-small t-subtle">Pronouns: {details.pronouns}</p>}

          {details.showCreations && (
            <section className="stack stack-2">
              <h2>About and creations</h2>
              {details.institution && <p className="t-small">Institution: {details.institution}</p>}
              {details.fieldOfStudy && <p className="t-small">Field of study: {details.fieldOfStudy}</p>}
              {details.skills.length > 0 && (
                <div className="row row-wrap">
                  {details.skills.slice(0, 30).map((skill) => (
                    <span className="tag" key={skill.key}>{skill.label}</span>
                  ))}
                </div>
              )}
              {visibleLinks.length > 0 && (
                <ul className="stack stack-1">
                  {visibleLinks.slice(0, 12).map((item, index) => (
                    <li key={`${item.url}-${index}`}>
                      <a className="lnk" href={item.url} target="_blank" rel="noopener noreferrer nofollow">
                        {item.label || item.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {details.showArchiveContributions && (
            <p className="t-small">
              <Link className="lnk" href="/archive">Explore the Archive</Link>
            </p>
          )}
        </section>

        <section className="stack stack-3">
          <h2>Recent activity</h2>
          {!details.showActivity ? (
            <p className="t-small t-subtle">This member has chosen to hide recent activity.</p>
          ) : recentPosts.length === 0 ? (
            <EmptyState title="No recent public posts" body="Posts shared with you will appear here when available." />
          ) : (
            recentPosts.map((post) => (
              <article className="card card-pad stack stack-2" key={post.id}>
                <div className="row row-between">
                  <span className="t-small t-meta">{absoluteDate(post.createdAt)}</span>
                  <Link className="lnk t-small" href={`/commons/${post.id}`}>Open post</Link>
                </div>
                {post.body && <p className="t-base">{post.body}</p>}
                {post.attachments.length > 0 && (
                  <p className="t-small t-subtle">{post.attachments.length} attachment(s)</p>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </PageShell>
  );
}
