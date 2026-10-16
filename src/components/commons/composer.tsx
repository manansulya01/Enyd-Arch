'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { onCreatePost } from '~/server/actions/commons-client';
import { onUploadFile } from '~/server/actions/exchange-client';
import { formatBytes } from '~/lib/format';

/**
 * The Commons composer. Text, an optional poll, and an optional attachment —
 * which is uploaded through the validated pipeline first, then referenced by id
 * so the browser never dictates where bytes land.
 */
export function Composer({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [poll, setPoll] = useState<null | { question: string; options: string[] }>(null);
  const [attachment, setAttachment] = useState<null | { fileId: string; name: string; size: number }>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const cleanPoll =
      poll && poll.options.filter((option) => option.trim().length > 0).length >= 2
        ? {
            question: poll.question.trim() || 'Untitled poll',
            options: poll.options.filter((option) => option.trim().length > 0).slice(0, 8),
            multiSelect: false,
          }
        : null;

    if (!body.trim() && !cleanPoll && !attachment) {
      setError('Write something, add a poll, or attach a file.');
      return;
    }

    startTransition(async () => {
      const result = await onCreatePost({
        body: body.trim(),
        poll: cleanPoll,
        attachmentFileIds: attachment ? [attachment.fileId] : [],
      });
      if (!result.ok) {
        setError(result.message ?? 'That post could not be saved.');
        return;
      }
      setBody('');
      setPoll(null);
      setAttachment(null);
      setNotice('Posted to the Commons.');
      router.refresh();
    });
  }

  async function attach(file: File) {
    setError(null);
    setUploading(true);
    const formData = new FormData();
    const csrf = document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value;
    if (csrf) formData.set('__csrf', csrf);
    formData.set('file', file);
    try {
      const result = await onUploadFile(formData);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'That file was refused.');
        return;
      }
      setAttachment({ fileId: result.data.fileId, name: result.data.displayName, size: result.data.byteSize });
    } catch {
      setError('The upload could not be completed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="composer card" onSubmit={submit}>
      <div className="composer-head">
        <span className="t-label">Say something to the Commons</span>
      </div>

      <div className="composer-input">
        <label className="sr-only" htmlFor="composer-body">
          Your post
        </label>
        <textarea
          id="composer-body"
          className="textarea-editor"
          rows={3}
          value={body}
          maxLength={5000}
          placeholder="Questions, work-in-progress, recommendations, observations. #topic to file it."
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      {poll && (
        <div className="card card-inset stack stack-2">
          <label className="field">
            <span className="field-label">Poll question</span>
            <input
              className="input"
              value={poll.question}
              onChange={(event) => setPoll({ ...poll, question: event.target.value })}
            />
          </label>
          {poll.options.map((option, index) => (
            <label className="field" key={index}>
              <span className="field-label">Option {index + 1}</span>
              <input
                className="input"
                value={option}
                onChange={(event) => {
                  const options = [...poll.options];
                  options[index] = event.target.value;
                  setPoll({ ...poll, options });
                }}
              />
            </label>
          ))}
          {poll.options.length < 8 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}
            >
              Add option
            </button>
          )}
        </div>
      )}

      {attachment && (
        <p className="upload-row">
          <span className="upload-row-glyph" aria-hidden="true">
            ⇄
          </span>
          <span className="truncate">{attachment.name}</span>
          <span className="t-meta">{formatBytes(attachment.size)}</span>
          <button type="button" className="lnk" onClick={() => setAttachment(null)}>
            remove
          </button>
        </p>
      )}

      <div className="composer-tools">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={Boolean(poll)}
          onClick={() => setPoll(poll ? null : { question: '', options: ['', ''] })}
        >
          <span className="act-glyph" aria-hidden="true">
            ▤
          </span>
          Poll
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          <span className="act-glyph" aria-hidden="true">
            ⇄
          </span>
          {uploading ? 'Uploading…' : 'Attach'}
        </button>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.epub"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void attach(file);
            event.target.value = '';
          }}
        />


        <div className="row row-end" style={{ marginLeft: 'auto' }}>
          {error && (
            <span className="t-small t-danger" role="alert">
              {error}
            </span>
          )}
          {notice && <span className="t-small t-success">{notice}</span>}
          <button className="btn btn-primary btn-sm" disabled={pending} type="submit">
            {pending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
}
