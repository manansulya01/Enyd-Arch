'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { voteCommunityPost } from '~/server/actions/communities';

export function CommunityPostVoting({
  postId,
  upvotes,
  downvotes,
  currentVote,
  joined,
  csrfToken,
}: {
  postId: string;
  upvotes: number;
  downvotes: number;
  currentVote: -1 | 0 | 1;
  joined: boolean;
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function vote(value: 1 | -1) {
    setBusy(true);
    setMessage('');
    try {
      const result = await voteCommunityPost({ postId, value, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not save vote.');
        return;
      }
      router.refresh();
    } catch {
      setMessage('Could not save vote. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack-1">
      <div className="row" aria-label="Discussion votes">
        <button
          className={currentVote === 1 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          type="button"
          aria-pressed={currentVote === 1}
          disabled={!joined || busy}
          onClick={() => void vote(1)}
        >
          ↑ Upvote · {upvotes}
        </button>
        <button
          className={currentVote === -1 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          type="button"
          aria-pressed={currentVote === -1}
          disabled={!joined || busy}
          onClick={() => void vote(-1)}
        >
          ↓ Downvote · {downvotes}
        </button>
      </div>
      {!joined && <p className="t-meta">Join this community to vote.</p>}
      {message && <p className="t-meta" role="status">{message}</p>}
    </div>
  );
}
