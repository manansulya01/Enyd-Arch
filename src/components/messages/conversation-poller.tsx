'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * SSE delivers new-message events quickly. A slower refresh remains as a
 * fallback for hosts that buffer or do not support long-lived event streams.
 */
export function ConversationPoller({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    let fallback: number | undefined;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const startFallback = () => {
      if (fallback === undefined) fallback = window.setInterval(refreshIfVisible, 15_000);
    };
    const stopFallback = () => {
      if (fallback !== undefined) {
        window.clearInterval(fallback);
        fallback = undefined;
      }
    };

    const source = new EventSource(`/api/messages/stream?conversation=${encodeURIComponent(conversationId)}`);
    source.addEventListener('message-created', refreshIfVisible);
    source.onopen = stopFallback;
    source.onerror = startFallback;
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      source.removeEventListener('message-created', refreshIfVisible);
      source.close();
      stopFallback();
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [conversationId, router]);

  return null;
}
