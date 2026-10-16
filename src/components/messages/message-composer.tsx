'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onSendMessage } from '~/server/actions/messages-client';

/**
 * Message composer. Optimistic only in the sense that the input clears on
 * success; a failure leaves the text in place so nothing typed is ever lost.
 */
export function MessageComposer({
  conversationId,
  csrf,
}: {
  conversationId: string;
  csrf?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<null | { fileId: string; name: string }>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text && !attachment) return;
    setError(null);

    startTransition(async () => {
      const token =
        document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value ?? '';
      const result = await onSendMessage(
        {
          conversationId,
          body: text,
          attachmentFileId: attachment?.fileId ?? null,
        },
        token,
      );
      if (!result.ok) {
        setError(result.message ?? 'That message was not sent.');
        return;
      }
      setBody('');
      setAttachment(null);
      router.refresh();
    });
  }

  return (
    <form className="thread-input" onSubmit={send}>
      <label className="sr-only" htmlFor="message-body">
        Write a message
      </label>
      <textarea
        id="message-body"
        className="textarea-editor"
        rows={2}
        maxLength={4000}
        value={body}
        placeholder="Write a message…"
        onChange={(event) => setBody(event.target.value)}
      />

      {attachment && (
        <p className="upload-row">
          <span className="upload-row-glyph" aria-hidden="true">
            ⇄
          </span>
          <span className="truncate">{attachment.name}</span>
          <button type="button" className="lnk" onClick={() => setAttachment(null)}>
            remove
          </button>
        </p>
      )}

      <div className="composer-tools">
        {csrf}
        <input type="hidden" name="conversationId" value={conversationId} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileInput.current?.click()}
        >
          Attach
        </button>
        <AttachmentPicker
          inputRef={fileInput}
          onPicked={(fileId, name) => setAttachment({ fileId, name })}
        />
        {error && (
          <span className="t-small t-danger" role="alert">
            {error}
          </span>
        )}
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending} style={{ marginInlineStart: 'auto' }}>
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

/** Uploads through the validated pipeline, then hands back a file id. */
function AttachmentPicker({
  inputRef,
  onPicked,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPicked: (fileId: string, name: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="image/*,audio/*,video/*,.pdf,.txt,.md"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const { onUploadFile } = await import('~/server/actions/exchange-client');
            const csrf = document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value;
            const formData = new FormData();
            if (csrf) formData.set('__csrf', csrf);
            formData.set('file', file);
            const result = await onUploadFile(formData);
            if (result.ok && result.data) onPicked(result.data.fileId, result.data.displayName);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <span className="t-meta">uploading…</span>}
    </>
  );
}
