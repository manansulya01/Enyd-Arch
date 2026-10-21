'use client';

import { useEffect, useRef } from 'react';
import { markConversationRead } from '~/server/actions/messages';

export function ConversationReadMarker({
  conversationId,
  csrfToken,
}: {
  conversationId: string;
  csrfToken: string;
}) {
  const lastMarked = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || lastMarked.current === conversationId) return;
    lastMarked.current = conversationId;
    void markConversationRead({ conversationId, csrf: csrfToken }).catch(() => {
      // Read state is best-effort; a later navigation can retry.
      lastMarked.current = null;
    });
  }, [conversationId, csrfToken]);

  return null;
}
