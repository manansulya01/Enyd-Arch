'use client';

import { useState, useTransition } from 'react';
import { resolveCommunityReport } from '~/server/actions/communities';
import type { CommunityModerationReportView } from '~/server/queries';

export function CommunityModerationQueue({
  initialReports,
  csrfToken,
}: {
  initialReports: CommunityModerationReportView[];
  csrfToken: string;
}) {
  const [reports, setReports] = useState(initialReports);
  const [resolution, setResolution] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resolve(reportId: string, outcome: 'resolved' | 'dismissed') {
    setMessage(null);
    startTransition(async () => {
      const result = await resolveCommunityReport(reportId, outcome, resolution, csrfToken);
      if (!result.ok) {
        setMessage(result.message ?? 'Could not update that report.');
        return;
      }
      setReports((current) => current.filter((report) => report.id !== reportId));
      setResolution('');
      setMessage(outcome === 'resolved' ? 'Report resolved.' : 'Report dismissed.');
    });
  }

  return (
    <section className="panel panel-body stack stack-3" aria-label="Community moderation queue">
      <h2>Community moderation queue</h2>
      <p className="t-small t-subtle">Only this community’s owner and moderators can see these reports. Reporter identities are not exposed.</p>
      {reports.length === 0 ? <p className="t-small">No open community reports.</p> : reports.map((report) => (
        <article className="card-pad stack stack-2" key={report.id}>
          <div className="row row-between row-wrap">
            <strong className="t-small">{report.targetType.replaceAll('_', ' ')} · {report.reason.replaceAll('_', ' ')}</strong>
            <span className="t-meta">{report.priority} · {new Date(report.createdAt).toLocaleString()}</span>
          </div>
          <blockquote className="t-small">{report.targetPreview}</blockquote>
          {report.detail && <p className="t-small">{report.detail}</p>}
          <label className="field">
            <span className="field-label">Resolution note</span>
            <textarea className="textarea-editor" rows={2} maxLength={2000} value={resolution} onChange={(event) => setResolution(event.target.value)} />
          </label>
          <div className="row row-wrap">
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => resolve(report.id, 'resolved')}>Resolve</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => resolve(report.id, 'dismissed')}>Dismiss</button>
          </div>
        </article>
      ))}
      {message && <p className="t-small" role="status">{message}</p>}
    </section>
  );
}
