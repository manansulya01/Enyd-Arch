'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { castGovernanceVote } from '~/server/actions/governance';

export function GovernanceVoteControls({
  proposalId,
  csrfToken,
  myVote,
  open,
}: {
  proposalId: string;
  csrfToken: string;
  myVote: number | null;
  open: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  async function vote(value: 1 | -1) {
    setBusy(true); setError('');
    try {
      const result = await castGovernanceVote(proposalId, value, note, csrfToken);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not record vote.');
    } catch { setError('Could not record vote.'); }
    finally { setBusy(false); }
  }
  if (!open) return <p className="t-meta">Voting is closed.</p>;
  return (
    <div className="stack stack-2">
      <label className="field"><span className="field-label">Optional note</span><textarea className="input" rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="row row-3">
        <button type="button" className={myVote === 1 ? 'btn btn-primary' : 'btn btn-secondary'} disabled={busy} onClick={() => void vote(1)}>{myVote === 1 ? 'Your vote: For' : 'Vote for'}</button>
        <button type="button" className={myVote === -1 ? 'btn btn-primary' : 'btn btn-secondary'} disabled={busy} onClick={() => void vote(-1)}>{myVote === -1 ? 'Your vote: Against' : 'Vote against'}</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
