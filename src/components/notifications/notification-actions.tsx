'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markAllNotificationsRead, markNotificationRead } from '~/server/actions/notifications';

export function MarkNotificationRead({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => startTransition(async () => {
      const result = await markNotificationRead(id);
      if (result.ok) router.refresh();
    })}>{pending ? 'Saving…' : 'Mark read'}</button>
  );
}

export function MarkAllNotificationsRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.ok) router.refresh();
    })}>{pending ? 'Saving…' : 'Mark all read'}</button>
  );
}
