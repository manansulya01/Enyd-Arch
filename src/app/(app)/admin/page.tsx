import { redirect } from 'next/navigation';
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
    <main className="page-shell">
      <header className="page-head">
        <div>
          <p className="eyebrow">The Inner Arch</p>
          <h1 className="page-title">Administration</h1>
          <p className="t-small t-muted">Invitation access is restricted to administrators with explicit invitation-management authority.</p>
        </div>
      </header>
      <InvitationManager
        csrfToken={csrfToken}
        initialInvitations={invitations.map((invite) => ({
          ...invite,
          createdAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt?.toISOString() ?? null,
          revokedAt: invite.revokedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
