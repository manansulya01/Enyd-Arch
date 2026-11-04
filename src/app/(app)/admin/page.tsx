import { redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { InvitationManager } from '~/components/admin/invitation-manager';
import { ModerationQueue } from '~/components/admin/moderation-queue';
import { adminCan, adminContextFor } from '~/server/security/audit';
import { currentActor } from '~/server/auth/session';
import { sessionCsrfToken } from '~/server/csrf';
import { listInvitations, openReportsForReview } from '~/server/actions/admin';

export const metadata = {
  title: 'Administration — Enyd Arch',
  description: 'Manage invitations and access to Enyd Arch.',
};

export default async function AdminPage() {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  const admin = await adminContextFor(actor.userId);
  if (!admin) redirect('/home');
  const canManageInvitations = adminCan(admin, 'invitations.manage');
  const canReadReports = adminCan(admin, 'reports.read');
  if (!canManageInvitations && !canReadReports) redirect('/home');

  const [invitations, reports, csrfToken] = await Promise.all([
    canManageInvitations ? listInvitations() : Promise.resolve([]),
    canReadReports ? openReportsForReview() : Promise.resolve([]),
    sessionCsrfToken(),
  ]);
  return (
    <PageShell title="Administration" sub="Administrative tools are shown only when your assigned role grants the corresponding permission.">
      <div className="stack stack-4">
        {canManageInvitations && (
          <InvitationManager
            csrfToken={csrfToken}
            initialInvitations={invitations.map((invite) => ({
              ...invite,
              createdAt: invite.createdAt.toISOString(),
              expiresAt: invite.expiresAt?.toISOString() ?? null,
              revokedAt: invite.revokedAt?.toISOString() ?? null,
            }))}
          />
        )}
        {canReadReports && (
          <ModerationQueue
            csrfToken={csrfToken}
            canResolve={adminCan(admin, 'reports.resolve')}
            initialReports={reports.map((report) => ({
              ...report,
              detail: report.detail ?? '',
              createdAt: report.createdAt.toISOString(),
            }))}
          />
        )}
      </div>
    </PageShell>
  );
}
