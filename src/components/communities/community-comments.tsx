'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCommunityComment, removeCommunityComment } from '~/server/actions/communities';

export type CommunityCommentView = {
  id: string;
  body: string;
  authorId: string;
  username: string;
  displayName: string;
  createdAt: string;
};

export function CommunityComments({
  postId,
  comments,
  csrfToken,
  viewerId,
  joined,
  canModerate,
}: {
  postId: string;
  comments: CommunityCommentView[];
  csrfToken: string;
  viewerId: string;
  joined: boolean;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function publish() {
    setBusy(true);
    setMessage('');
    try {
      const result = await createCommunityComment({ postId, body, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not publish comment.');
        return;
      }
      setBody('');
      setMessage('Comment published.');
      router.refresh();
    } catch {
      setMessage('Could not publish comment. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await removeCommunityComment(commentId, csrfToken);
      if (!result.ok) {
        setMessage(result.message ?? 'Could not remove comment.');
        return;
      }
      setMessage('Comment removed.');
      router.refresh();
    } catch {
      setMessage('Could not remove comment. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack stack-2" aria-label="Discussion comments">
      <h3 className="t-small">Comments · {comments.length}</h3>
      {comments.map(comment => (
        <article className="panel panel-body stack stack-1" key={comment.id}>
          <div className="row row-between">
            <p className="t-meta">{comment.displayName} (@{comment.username}) · {new Date(comment.createdAt).toLocaleDateString()}</p>
            {(comment.authorId === viewerId || canModerate) && (
              <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void remove(comment.id)}>
                Remove
              </button>
            )}
          </div>
          <p className="prose">{comment.body}</p>
        </article>
      ))}
      {joined && (
        <div className="stack stack-2">
          <label className="field">
            <span className="field-label">Add a comment</span>
            <textarea className="input" value={body} onChange={event => setBody(event.target.value)} maxLength={2500} rows={2} placeholder="Add something useful to the discussion…" />
          </label>
          <div>
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy || !body.trim()} onClick={() => void publish()}>
              {busy ? 'Working…' : 'Comment'}
            </button>
          </div>
        </div>
      )}
      {!joined && <p className="t-meta">Join this community to comment.</p>}
      {message && <p className="t-small" role="status">{message}</p>}
    </section>
  );
}
