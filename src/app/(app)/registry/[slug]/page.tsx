import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar } from '~/components/ui';
import { memberByUsername } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { ageBandLabel } from '~/lib/domain';
import { ConnectionRequestComposer } from '~/components/connections/connection-request-composer';
import { DirectMessageButton } from '~/components/messages/direct-message-button';
import { sessionCsrfToken } from '~/server/csrf';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { actor } = await requireOnboarded();
  const member = await memberByUsername(slug, actor.userId);
  if (!member) return { title: 'Member not found — The Registry' };
  return { title: `${member.displayName} — The Registry`, description: member.headline ?? `Enyd Arch member @${member.username}` };
}

export default async function RegistryMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const member = await memberByUsername(slug, actor.userId);
  if (!member) notFound();
  const csrfToken = await sessionCsrfToken();

  return (
    <PageShell title={member.displayName} sub={member.headline ?? 'Member of Enyd Arch'}>
      <section className="panel panel-body">
        <div className="row row-3">
          <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
          <div className="grow">
            <p className="t-small t-muted">@{member.username}</p>
            <p className="t-meta">{member.memberId}</p>
            <h2>{member.levelLabel}</h2>
          </div>
        </div>
        <dl className="stack stack-3" style={{ marginTop: 'var(--sp-5)' }}>
          <div><dt className="t-label">Standing</dt><dd>{member.levelLabel}</dd></div>
          <div><dt className="t-label">Age group</dt><dd>{member.ageBandLabel === 'Undisclosed' ? 'Undisclosed' : ageBandLabel(member.ageBand)}</dd></div>
          {member.region && <div><dt className="t-label">Region</dt><dd>{member.region}</dd></div>}
          <div><dt className="t-label">Joined</dt><dd>{member.joinedAt.toLocaleDateString()}</dd></div>
        </dl>
      </section>
      {member.userId !== actor.userId && (
        <>
          <DirectMessageButton userId={member.userId} csrfToken={csrfToken} />
          <ConnectionRequestComposer toUserId={member.userId} csrfToken={csrfToken} />
        </>
      )}
      <div className="row row-3">
        <Link className="btn btn-secondary" href="/registry">Back to the Registry</Link>
      </div>
    </PageShell>
  );
}
