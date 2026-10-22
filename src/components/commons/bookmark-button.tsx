'use client';

import { useState, useTransition } from 'react';
import { onToggleBookmark } from '~/server/actions/commons-client';

type BookmarkTarget = 'post' | 'archive_object' | 'game' | 'gallery_post';

export function BookmarkButton({
  targetType,
  targetId,
  csrfToken,
  initialSaved,
}: {
  targetType: BookmarkTarget;
  targetId: string;
  csrfToken: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await onToggleBookmark({ targetType, targetId }, csrfToken);
      if (result.ok && result.data) setSaved(result.data.saved);
      else setError(result.message ?? 'That item could not be saved.');
    });
  }

  return (
    <span className="stack stack-1">
      <button
        type="button"
        className={`btn btn-sm ${saved ? 'btn-primary' : 'btn-ghost'}`}
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        title={saved ? 'Remove from saved items' : 'Save for later'}
      >
        <span aria-hidden="true">{saved ? '★' : '☆'}</span> {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
      {error && <span className="t-small t-danger" role="alert">{error}</span>}
    </span>
  );
}
