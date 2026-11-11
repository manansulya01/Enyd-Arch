'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keep notification badges and the notification page fresh without constant polling. */
export function NotificationStreamRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource('/api/notifications/stream');
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    source.addEventListener('notification', refresh);
    return () => {
      source.removeEventListener('notification', refresh);
      source.close();
    };
  }, [router]);

  return null;
}
