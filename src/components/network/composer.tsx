'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { onCreatePost } from '~/server/actions/commons-client';
import { CsrfField } from '~/components/shell/csrf-field';

export function NetworkComposer() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text) {
      setError('Write something.');
      return;
    }

    startTransition(async () => {
      const result = await onCreatePost({
        body: text,
        poll: null,
        attachmentFileIds: [],
      });
      if (!result.ok) {
        setError(result.message ?? 'That post could not be saved.');
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <form className="composer card card-inset" onSubmit={submit}>
      <label className="sr-only" htmlFor="network-composer-body">
        Write a post
      </label>
      <textarea
        id="network-composer-body"
        className="textarea-editor"
        rows={3}
        placeholder="What’s on your mind?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="composer-tools">
        <span className="t-meta" style={{ marginInlineStart: 'auto' }}>
          {error && <span className="t-danger"> {error}</span>}
        </span>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}