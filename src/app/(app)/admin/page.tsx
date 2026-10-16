import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { AdminReportActions } from '~/components/admin/admin-report-actions';
import { requireOnboarded } from '~/server/guard';
import { adminCan, adminContextFor } from '~/server/security/audit';
import { openReportsForReview } from '~/server/actions/admin';

export const metadata: Metadata = { title: 'Administration' };

export default async function AdminPage() {
  const { actor } = await requireOnboarded();
  const admin = await adminContextFor(actor.userId);
  if (!admin || !adminCan(admin, 'reports.read')) redirect('/home');

  const reports = await openReportsForReview();
  return (
    <PageShell title="Administration" sub="Review reports deliberately; every decision is audited." wide>
      {reports.length === 0 ? (
        <EmptyState glyph="⚿" title="No open reports." body="Reports that need moderator attention will appear here." />
      ) : (
        <div className="stack stack-3">
          {reports.map((report) => (
            <article className="panel panel-body stack stack-3" key={report.id}>
              <div className="row row-between row-wrap">
                <span className="badge">{report.priority}</span>
                <span className="t-meta">{report.createdAt.toLocaleString()}</span>
              </div>
              <h2 className="t-heading">{report.reason.replaceAll('_', ' ')}</h2>
              <p className="t-small t-subtle">Target: {report.targetType} · reference {report.targetId}</p>
              {report.detail && <p className="t-body">{report.detail}</p>}
              <p className="t-meta">State: {report.state}</p>
              <AdminReportActions reportId={report.id} />
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
