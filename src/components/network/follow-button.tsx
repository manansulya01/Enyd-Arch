'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { followMember, unfollowMember } from '~/server/actions/follows';

export function FollowButton({ targetUserId, initialFollowing, csrfToken }: {
  targetUserId: string;
  initialFollowing: boolean;
  csrfToken: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function toggle() {
    setBusy(true);
    setMessage('');
    try {
      const result = following
        ? await unfollowMember(targetUserId, csrfToken)
        : await followMember(targetUserId, csrfToken);
      if (!result.ok) {
        setMessage(result.message ?? 'Could not update follow status.');
        return;
      }
      setFollowing(!following);
      router.refresh();
    } catch {
      setMessage('Could not update follow status. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <span className="stack stack-1">
    <button className={following ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm'} type="button" disabled={busy} aria-pressed={following} onClick={() => void toggle()}>{busy ? '…' : following ? 'Following' : 'Follow'}</button>
    {message && <span className="t-meta" role="status">{message}</span>}
  </span>;
}
