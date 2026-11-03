import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireAdmin } from '~/server/guard';
import { openReportsForReview } from '~/server/actions/admin';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'Administration' };

export default async function AdminPage() {
  await requireAdmin('reports.read');
  const reports = await openReportsForReview();

  return (
    <PageShell title="Administration" sub="Safety queue and community operations.">
      {reports.length === 0 ? (
        <EmptyState glyph="⚿" title="The queue is clear." body="New reports requiring review will appear here." />
      ) : (
        <div className="stack stack-3">
          {reports.map((report) => (
            <article className="card card-pad-md stack stack-2" key={report.id}>
              <div className="row row-between">
                <span className="t-label">{report.reason.replaceAll('_', ' ')}</span>
                <span className="badge badge-plain">{report.priority} · {report.state}</span>
              </div>
              <p className="t-small">{report.detail || 'No additional details supplied.'}</p>
              <div className="row row-between t-meta">
                <span>{report.targetType} · {report.targetId}</span>
                <time dateTime={report.createdAt.toISOString()}>{relativeTime(report.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
