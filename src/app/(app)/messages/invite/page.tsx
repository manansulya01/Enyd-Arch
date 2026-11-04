import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { GroupInviteAccept } from '~/components/messages/group-invite-accept';
import { requireCapability } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = {
  title: 'Group invitation',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function GroupInvitePage() {
  await requireCapability('message');
  const csrfToken = await sessionCsrfToken();
  return (
    <PageShell title="Group invitation" sub="Review and explicitly accept a private group conversation invitation.">
      <div style={{ maxWidth: 620 }}>
        <GroupInviteAccept csrfToken={csrfToken} />
      </div>
    </PageShell>
  );
}
