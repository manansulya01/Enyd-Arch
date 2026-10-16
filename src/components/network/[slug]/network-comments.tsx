'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CommentView } from '~/server/queries';
import { relativeTime } from '~/lib/format';
import { Avatar } from '~/components/ui';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { onCreateComment } from '~/server/actions/commons-client';

/** The reply thread beneath a network post. Replies are one level deep by design. */
export function NetworkComments({ postId, comments }: { postId: string; comments: CommentView[] }) {
  const router = useRouter();
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
      const result = await onCreateComment({ postId, body: text, parentId: replyTo });
      if (!result.ok) {
        setError(result.message ?? 'That reply could not be saved.');
        return;
      }
      setBody('');
      setReplyTo(null);
      router.refresh();
    });
  }

  return (
    <section className="panel" aria-label="Replies">
      <div className="panel-head">
        <span className="t-label">
          {comments.length} repl{comments.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div className="panel-body stack stack-4">
        {ordered.length === 0 ? (
          <p className="t-small t-subtle">No replies yet. Say the first thing.</p>
        ) : (
          <div className="comment-thread">
            {ordered.map((comment) => (
              <article
                className="comment"
                key={comment.id}
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
                    targetType="comment"
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
            Write a reply
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
              {pending ? 'Posting…' : 'Reply'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}