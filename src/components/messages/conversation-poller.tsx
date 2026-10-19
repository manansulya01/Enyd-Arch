'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Refresh an open thread while visible so incoming messages arrive without a manual reload. */
export function ConversationPoller({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refreshIfVisible, 8000);
    return () => window.clearInterval(timer);
  }, [conversationId, router]);

  return null;
}
