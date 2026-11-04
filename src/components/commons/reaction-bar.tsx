'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { REACTIONS } from '~/lib/domain';
import { onToggleBookmark, onToggleReaction } from '~/server/actions/commons-client';

/**
 * Reaction bar. Optimistic in the common case and always reconciled by the
 * server's returned count, so two people reacting at once cannot drift.
 */
export function ReactionBar({
  targetType,
  targetId,
  myReactions,
  count,
  bookmarked,
  csrfToken,
}: {
  csrfToken: string;
  targetType: 'post' | 'comment' | 'archive_object' | 'gallery_post' | 'game_comment';
  targetId: string;
  myReactions: string[];
  count: number;
  bookmarked?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [active, setActive] = useState<string[]>(myReactions);
  const [total, setTotal] = useState(count);
  const [saved, setSaved] = useState(Boolean(bookmarked));
  const [open, setOpen] = useState(false);

  function toggleSaved() {
    if (targetType !== 'post' && targetType !== 'archive_object' && targetType !== 'gallery_post') return;
    startTransition(async () => {
      const result = await onToggleBookmark(
        { targetType, targetId },
        csrfToken,
      );
      if (result.ok && result.data) setSaved(result.data.saved);
      else router.refresh();
    });
  }

  function toggle(kind: string) {
    const wasActive = active.includes(kind);
    setActive((current) =>
      wasActive ? current.filter((entry) => entry !== kind) : [...current, kind],
    );
    setTotal((current) => Math.max(0, current + (wasActive ? -1 : 1)));
    startTransition(async () => {
      const result = await onToggleReaction({ targetType, targetId, kind }, csrfToken);
      if (result.ok && result.data) setTotal(result.data.count);
      else router.refresh();
    });
  }

  return (
    <div className="reaction-bar">
      {active.map((kind) => {
        const definition = REACTIONS.find((entry) => entry.key === kind);
        return (
          <button
            key={kind}
            type="button"
            className="reaction-pill is-active"
            onClick={() => toggle(kind)}
            aria-pressed="true"
            title={definition?.label ?? kind}
          >
            <span aria-hidden="true">{definition?.glyph ?? '◈'}</span> {definition?.label ?? kind}
          </button>
        );
      })}

      {active.length < REACTIONS.length && (
        <div className="reaction-add">
          <button
            type="button"
            className="reaction-pill"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="true"
          >
            <span aria-hidden="true">✦</span> React
          </button>
          {open && (
            <div className="menu" role="menu">
              {REACTIONS.filter((entry) => !active.includes(entry.key)).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    toggle(entry.key);
                    setOpen(false);
                  }}
                >
                  <span aria-hidden="true">{entry.glyph}</span> {entry.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {total > 0 && <span className="t-meta">{total}</span>}

      {bookmarked !== undefined && (
        <button
          type="button"
          className="reaction-pill"
          onClick={toggleSaved}
          aria-pressed={saved}
          title="Save to your bookmarks"
        >
          <span aria-hidden="true">{saved ? '★' : '☆'}</span> Save
        </button>
      )}
    </div>
  );
}
