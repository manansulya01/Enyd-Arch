import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { CommunityInviteAccept } from '~/components/communities/community-invite-accept';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = {
  title: 'Private community invitation',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function CommunityInvitePage() {
  await requireOnboarded();
  const csrfToken = await sessionCsrfToken();
  return (
    <PageShell title="Private community invitation" sub="Review and explicitly accept a private community invitation.">
      <div style={{ maxWidth: 620 }}>
        <CommunityInviteAccept csrfToken={csrfToken} />
      </div>
    </PageShell>
  );
}
