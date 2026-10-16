'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveReport } from '~/server/actions/admin';

export function AdminReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(outcome: 'resolved' | 'dismissed') {
    const resolution = window.prompt(outcome === 'resolved' ? 'Brief resolution note (optional):' : 'Why is this report being dismissed?');
    if (resolution === null) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveReport(reportId, outcome, resolution);
      if (!result.ok) {
        setError(result.message ?? 'The report could not be updated.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="stack stack-2">
      <div className="row row-wrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => resolve('resolved')}>Resolve</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => resolve('dismissed')}>Dismiss</button>
      </div>
      {error && <p className="t-danger" role="alert">{error}</p>}
    </div>
  );
}
