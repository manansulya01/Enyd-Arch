'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PollView } from '~/server/queries';
import { onVoteInPoll } from '~/server/actions/commons-client';

/** Viewer-aware poll controls. Existing votes are preserved for multi-select polls. */
export function PollWidget({ poll, csrfToken }: { poll: PollView; csrfToken: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() =>
    poll.options.filter((option) => option.selected).map((option) => option.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const closed = Boolean(poll.closesAt && poll.closesAt.getTime() <= Date.now());

  function choose(optionId: string) {
    setError(null);
    if (!poll.multiSelect) {
      setSelected([optionId]);
      return;
    }
    if (poll.options.some((option) => option.id === optionId && option.selected)) return;
    setSelected((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  }

  function submit() {
    if (closed || selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      for (const optionId of selected) {
        const result = await onVoteInPoll({ pollId: poll.id, optionId }, csrfToken);
        if (!result.ok) {
          setError(result.message ?? 'Your vote could not be saved.');
          return;
        }
      }
      router.refresh();
    });
  }

  return (
    <section className="poll" aria-label="Poll">
      <p className="poll-question">{poll.question}</p>
      <div className="poll-options">
        {poll.options.map((option) => {
          const percent = poll.totalVotes ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
          return (
            <label className="poll-option" key={option.id}>
              {!closed && (
                <input
                  type={poll.multiSelect ? 'checkbox' : 'radio'}
                  name={`poll-${poll.id}`}
                  checked={selected.includes(option.id)}
                  disabled={pending || (poll.multiSelect && option.selected)}
                  onChange={() => choose(option.id)}
                />
              )}
              <span className="poll-option-label">{option.label}</span>
              {poll.revealed && (
                <span className="poll-option-bar" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </span>
              )}
              {poll.revealed && (
                <span className="poll-option-pct">{option.votes} · {percent}%</span>
              )}
            </label>
          );
        })}
      </div>
      <div className="row row-between row-wrap">
        <span className="poll-foot t-meta">
          {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
          {poll.closesAt ? ` · ${closed ? 'closed' : 'closes'} ${poll.closesAt.toLocaleDateString()}` : ''}
          {poll.multiSelect ? ' · select all that apply' : ''}
        </span>
        {!closed && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || selected.length === 0}
            onClick={submit}
          >
            {pending ? 'Saving…' : poll.viewerVoted ? 'Update vote' : 'Vote'}
          </button>
        )}
      </div>
      {error && <p className="t-small t-danger" role="alert">{error}</p>}
    </section>
  );
}
