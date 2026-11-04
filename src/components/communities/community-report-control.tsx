'use client';

import { useState, useTransition } from 'react';
import { createReport } from '~/server/actions/reports';

type CommunityReportTarget = 'community_post' | 'community_comment';

export function CommunityReportControl({
  targetType,
  targetId,
  csrfToken,
}: {
  targetType: CommunityReportTarget;
  targetId: string;
  csrfToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setStatus(null);
    startTransition(async () => {
      const result = await createReport(null, formData);
      if (!result.ok) {
        setStatus(result.message ?? 'The report could not be submitted.');
        return;
      }
      setOpen(false);
      setStatus('Report submitted for review.');
    });
  }

  return (
    <div className="stack stack-2">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? 'Cancel report' : 'Report'}
      </button>
      {open && (
        <form className="card-pad stack stack-2" onSubmit={submit}>
          <input type="hidden" name="__csrf" value={csrfToken} />
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <label className="field">
            <span className="field-label">Reason</span>
            <select className="input" name="reason" defaultValue="spam" required>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="hate_or_discrimination">Hate or discrimination</option>
              <option value="privacy_violation">Privacy violation</option>
              <option value="threat_or_violence">Threat or violence</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Additional detail (optional)</span>
            <textarea className="textarea-editor" name="detail" rows={2} maxLength={4000} />
          </label>
          <button className="btn btn-secondary btn-sm" type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit report'}</button>
        </form>
      )}
      {status && <p className="t-meta" role="status">{status}</p>}
    </div>
  );
}
