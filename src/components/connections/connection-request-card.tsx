'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { respondToRequest } from '~/server/actions/connections';

export function ConnectionRequestCard({
  request,
  csrfToken,
}: {
  request: { id: string; mode: string; note: string; createdAt: string; from: { username: string; displayName: string; headline: string | null } };
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function respond(accept: boolean) {
    setBusy(true); setError('');
    try {
      const result = await respondToRequest(request.id, accept, csrfToken);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not update this request.');
    } catch { setError('Could not update this request.'); }
    finally { setBusy(false); }
  }
  return (
    <article className="panel panel-body stack stack-2">
      <div className="row row-between">
        <div><h3><Link href={'/registry/' + request.from.username}>{request.from.displayName}</Link></h3><p className="t-meta">{request.mode.replaceAll('_', ' ')} · {new Date(request.createdAt).toLocaleDateString()}</p></div>
      </div>
      {request.note && <p className="t-small">{request.note}</p>}
      <div className="row row-3">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void respond(true)}>{busy ? 'Saving…' : 'Accept'}</button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void respond(false)}>Decline</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </article>
  );
}
