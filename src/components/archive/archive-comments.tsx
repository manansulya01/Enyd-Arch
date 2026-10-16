'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { relativeTime } from '~/lib/format';
import { Avatar } from '~/components/ui';
import { onCommentOnArchiveObject } from '~/server/actions/exchange-client';

interface ArchiveCommentView {
  id: string;
  body: string;
  createdAt: Date;
  author: { username: string; displayName: string; memberId: string; avatarUrl: string | null; level: string };
}

/** Annotations on an Archive object. */
export function ArchiveComments({
  objectId,
  comments,
  csrf,
}: {
  objectId: string;
  comments: ArchiveCommentView[];
  csrf?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await onCommentOnArchiveObject({ objectId, body: text, csrf: csrfToken() });
      if (!result.ok) {
        setError(result.message ?? 'That comment was not saved.');
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <section className="panel" aria-label="Annotations">
      <div className="panel-head">
        <span className="t-label">
          {comments.length} annotation{comments.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="panel-body stack stack-3">
        {comments.length === 0 ? (
          <p className="t-small t-subtle">Nothing annotated yet.</p>
        ) : (
          comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <div className="comment-header">
                <Avatar
                  displayName={comment.author.displayName}
                  avatarUrl={comment.author.avatarUrl}
                  size="xs"
                />
                <span className="comment-author">{comment.author.displayName}</span>
                <span className="t-meta">{relativeTime(comment.createdAt)}</span>
              </div>
              <p className="comment-text">{comment.body}</p>
            </article>
          ))
        )}

        <form className="composer card card-inset" onSubmit={submit}>
          <label className="sr-only" htmlFor="archive-comment">
            Add an annotation
          </label>
          <textarea
            id="archive-comment"
            className="textarea-editor"
            rows={2}
            maxLength={2000}
            value={body}
            placeholder="Add a note about this object…"
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="composer-tools">
            {error && (
              <span className="t-small t-danger" role="alert">
                {error}
              </span>
            )}
            <button className="btn btn-primary btn-sm" type="submit" disabled={pending} style={{ marginInlineStart: 'auto' }}>
              {pending ? 'Saving…' : 'Annotate'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function csrfToken(): string {
  return typeof document === 'undefined'
    ? ''
    : document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value ?? '';
}
