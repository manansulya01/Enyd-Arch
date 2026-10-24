'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { CommentView } from '~/server/queries';
import { relativeTime } from '~/lib/format';
import { Avatar } from '~/components/ui';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { onCommentOnGame } from '~/server/actions/arcade-client';

/** The comment thread beneath a game. Replies are one level deep by design. */
export function GameComments({ gameId, comments, csrfToken }: { gameId: string; comments: CommentView[]; csrfToken: string }) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...comments].sort((a, b) => a.depth - b.depth || a.createdAt.getTime() - b.createdAt.getTime());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await onCommentOnGame({ gameId, body: text, parentId: replyTo, csrf: csrfToken });
      if (!result.ok) {
        setError(result.message ?? 'That comment could not be saved.');
        return;
      }
      setBody('');
      setReplyTo(null);
      // In a real app, we would refresh or update the comments list
      // For now, we'll just clear the form
    });
  }

  return (
    <section className="panel" aria-label="Comments">
      <div className="panel-head">
        <span className="t-label">
          {comments.length} comment{comments.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="panel-body stack stack-4">
        {ordered.length === 0 ? (
          <p className="t-small t-subtle">No comments yet. Be the first to say something.</p>
        ) : (
          <div className="comment-thread">
            {ordered.map((comment) => (
              <article
                key={comment.id}
                className="comment"
                style={{ marginInlineStart: `min(${comment.depth * 20}px, 40px)` }}
              >
                <div className="comment-header">
                  <Avatar
                    displayName={comment.author.displayName}
                    avatarUrl={comment.author.avatarUrl}
                    size="xs"
                    level={comment.author.level}
                  />
                  <Link className="comment-author" href={`/network/${comment.author.username}`}>
                    {comment.author.displayName}
                  </Link>
                  <span className="t-meta">{relativeTime(comment.createdAt)}</span>
                </div>
                <p className="comment-text">{comment.body}</p>
                <div className="comment-actions">
                  <button
                    type="button"
                    className="lnk"
                    onClick={() => {
                      setReplyTo(comment.id);
                      setBody(`@${comment.author.username} `);
                    }}
                  >
                    Reply
                  </button>
                  <ReactionBar
                    csrfToken={csrfToken}
                    targetType="game_comment"
                    targetId={comment.id}
                    myReactions={comment.myReactions}
                    count={comment.reactionCount}
                  />
                </div>
              </article>
            ))}
          </div>
        )}

        <form className="composer card card-inset" onSubmit={submit}>
          <label className="sr-only" htmlFor="comment-body">
            Write a comment
          </label>
          <textarea
            id="comment-body"
            className="textarea-editor"
            rows={2}
            maxLength={2500}
            value={body}
            placeholder={replyTo ? 'Replying…' : 'Add to the conversation…'}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="composer-tools">
            {replyTo && (
              <button type="button" className="lnk" onClick={() => setReplyTo(null)}>
                cancel reply
              </button>
            )}
            <span className="t-meta" style={{ marginInlineStart: 'auto' }}>
              {error && <span className="t-danger"> {error}</span>}
            </span>
            <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
              {pending ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}