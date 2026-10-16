import { redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { InvitationManager } from '~/components/admin/invitation-manager';
import { adminCan, adminContextFor } from '~/server/security/audit';
import { currentActor } from '~/server/auth/session';
import { sessionCsrfToken } from '~/server/csrf';
import { listInvitations } from '~/server/actions/admin';

export const metadata = {
  title: 'Administration — Enyd Arch',
  description: 'Manage invitations and access to Enyd Arch.',
};

export default async function AdminPage() {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  const admin = await adminContextFor(actor.userId);
  if (!admin || !adminCan(admin, 'invitations.manage')) redirect('/home');

  const [invitations, csrfToken] = await Promise.all([listInvitations(), sessionCsrfToken()]);
  return (
    <PageShell title="Administration" sub="Invitation access is restricted to administrators with explicit invitation-management authority.">
      <InvitationManager
        csrfToken={csrfToken}
        initialInvitations={invitations.map((invite) => ({
          ...invite,
          createdAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt?.toISOString() ?? null,
          revokedAt: invite.revokedAt?.toISOString() ?? null,
        }))}
      />
    </PageShell>
  );
}
