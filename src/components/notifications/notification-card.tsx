'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { markNotificationRead } from '~/server/actions/notifications';

export function NotificationCard({
  item,
  csrfToken,
}: {
  item: { id: string; title: string; body: string; href: string | null; read: boolean; kind: string; createdAt: string };
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function markRead() {
    setBusy(true); setError('');
    try {
      const result = await markNotificationRead(item.id, csrfToken);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not mark this notification read.');
    } catch { setError('Could not mark this notification read.'); }
    finally { setBusy(false); }
  }
  return (
    <article className={'panel panel-body stack stack-2 ' + (item.read ? 'notification-read' : 'notification-unread')}>
      <div className="row row-between">
        <span className="t-meta">{item.kind.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}</span>
        {!item.read && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void markRead()}>{busy ? 'Saving…' : 'Mark read'}</button>}
      </div>
      <h2>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h2>
      <p className="t-small t-muted">{item.body}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </article>
  );
}
