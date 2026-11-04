'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleWatchlist } from '~/server/actions/cinema';

export function WatchlistButton({ filmId, initial, csrfToken }: { filmId: string; initial: boolean; csrfToken: string }) {
  const router = useRouter();
  const [added, setAdded] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setBusy(true); setError('');
    try {
      const result = await toggleWatchlist(filmId, csrfToken);
      if (result.ok) {
        setAdded(Boolean(result.data?.added));
        router.refresh();
      } else setError(result.message ?? 'Could not update your watchlist.');
    } catch { setError('Could not update your watchlist.'); }
    finally { setBusy(false); }
  }
  return <div className="stack stack-1"><button className={added ? 'btn btn-secondary' : 'btn btn-primary'} type="button" onClick={() => void toggle()} disabled={busy}>{busy ? 'Saving…' : added ? 'Remove from watchlist' : 'Add to watchlist'}</button>{error && <span className="field-error" role="alert">{error}</span>}</div>;
}
