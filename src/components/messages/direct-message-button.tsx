'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { onStartDirect } from '~/server/actions/messages-client';

export function DirectMessageButton({
  userId,
  csrfToken,
}: {
  userId: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const result = await onStartDirect(userId, csrfToken);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'A conversation could not be started.');
        return;
      }
      router.push(`/messages?c=${encodeURIComponent(result.data.conversationId)}`);
      router.refresh();
    } catch {
      setError('A conversation could not be started. Check the member’s contact settings and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack-2">
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? 'Opening…' : 'Message'}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
