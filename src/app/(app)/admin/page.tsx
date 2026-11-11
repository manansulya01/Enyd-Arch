import { redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { InvitationManager } from '~/components/admin/invitation-manager';
import { ModerationQueue } from '~/components/admin/moderation-queue';
import { GameReviewQueue } from '~/components/admin/game-review-queue';
import { adminCan, adminContextFor } from '~/server/security/audit';
import { currentActor } from '~/server/auth/session';
import { sessionCsrfToken } from '~/server/csrf';
import { listGamesForReview, listInvitations, openReportsForReview } from '~/server/actions/admin';

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
  const canReviewGames = adminCan(admin, 'games.review');
  if (!canManageInvitations && !canReadReports && !canReviewGames) redirect('/home');

  const [invitations, reports, games, csrfToken] = await Promise.all([
    canManageInvitations ? listInvitations() : Promise.resolve([]),
    canReadReports ? openReportsForReview() : Promise.resolve([]),
    canReviewGames ? listGamesForReview() : Promise.resolve([]),
    sessionCsrfToken(),
  ]);
  return (
    <PageShell title="Administration" sub="Administrative tools are shown only when your assigned role grants the corresponding permission.">
      <div className="stack stack-4">
        {canReviewGames && (
          <GameReviewQueue
            csrfToken={csrfToken}
            initialGames={games.map((game) => ({
              ...game,
              createdAt: game.createdAt.toISOString(),
            }))}
          />
        )}
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
