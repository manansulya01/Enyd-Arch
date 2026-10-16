'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GALLERY_KINDS } from '~/lib/domain';
import { createGalleryPost, commentOnGalleryPost } from '~/server/actions/gallery';
import { onUploadFile } from '~/server/actions/exchange-client';

export function GalleryCommentForm({ postId, csrf }: { postId: string; csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set('postId', postId);
    startTransition(async () => {
      const result = await commentOnGalleryPost(null, data);
      if (!result.ok) {
        setError(result.message ?? 'The comment could not be posted.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <h2 className="t-heading">Leave a comment</h2>
      <textarea className="textarea" name="body" maxLength={2000} rows={3} required placeholder="Be kind. Do not share private information." />
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Posting…' : 'Post comment'}</button>
    </form>
  );
}

export function GalleryCreateForm({ csrf }: { csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('writing');
  const [fileIds, setFileIds] = useState<string[]>([]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    const data = new FormData();
    data.set('__csrf', document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value ?? '');
    data.set('file', file);
    try {
      const result = await onUploadFile(data);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The file could not be uploaded.');
        return;
      }
      setFileIds((current) => [...current, result.data!.fileId].slice(0, 8));
    } finally {
      setUploading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('fileIds', fileIds.join(','));
    startTransition(async () => {
      const result = await createGalleryPost(null, data);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The Gallery post could not be created.');
        return;
      }
      router.push(`/gallery/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-4" onSubmit={submit}>
      {csrf}
      <label className="field">
        <span className="field-label">Medium</span>
        <select className="select" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {GALLERY_KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Title</span>
        <input className="input" name="title" minLength={2} maxLength={180} required />
      </label>
      <label className="field">
        <span className="field-label">Caption</span>
        <textarea className="textarea" name="caption" maxLength={2000} rows={2} />
      </label>
      {kind === 'writing' && (
        <label className="field">
          <span className="field-label">Writing</span>
          <textarea className="textarea" name="body" minLength={40} maxLength={20000} rows={10} required />
        </label>
      )}
      {kind !== 'writing' && (
        <div className="stack stack-2">
          <span className="field-label">Media files</span>
          <input
            className="input"
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.txt,.md"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
            disabled={uploading || fileIds.length >= 8}
          />
          <p className="t-meta">Uploads are validated and scanned before attachment. Up to eight files.</p>
          {fileIds.length > 0 && (
            <ul className="stack stack-1">
              {fileIds.map((id) => (
                <li key={id} className="row row-between">
                  <span className="t-small mono">{id}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFileIds((items) => items.filter((item) => item !== id))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending || uploading}>
        {pending ? 'Publishing…' : uploading ? 'Checking file…' : 'Publish to the Gallery'}
      </button>
    </form>
  );
}
