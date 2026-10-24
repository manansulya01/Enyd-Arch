'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rsvpToEvent } from '~/server/actions/events';

export function RSVPButtons({ eventId, current, csrfToken }: { eventId: string; current: string | null; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function choose(status: 'going' | 'interested' | 'declined') {
    setBusy(true);
    setMessage('');
    try {
      const result = await rsvpToEvent(eventId, status, csrfToken);
      if (!result.ok) setMessage(result.message ?? 'Could not update your RSVP.');
      else router.refresh();
    } catch {
      setMessage('Could not update your RSVP. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack stack-2">
      <div className="row row-3">
        <button className={current === 'going' ? 'btn btn-primary' : 'btn btn-secondary'} type="button" disabled={busy} onClick={() => void choose('going')}>Going</button>
        <button className={current === 'interested' ? 'btn btn-primary' : 'btn btn-secondary'} type="button" disabled={busy} onClick={() => void choose('interested')}>Interested</button>
        {current && current !== 'declined' && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void choose('declined')}>Withdraw</button>}
      </div>
      {message && <p className="field-error" role="alert">{message}</p>}
    </div>
  );
}
