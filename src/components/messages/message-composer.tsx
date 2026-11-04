'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onSendMessage } from '~/server/actions/messages-client';

/**
 * Message composer. Optimistic only in the sense that the input clears on
 * success; a failure leaves the text in place so nothing typed is ever lost.
 */
export function MessageComposer({
  conversationId,
  csrf,
  replyToId,
  replyPreview,
}: {
  conversationId: string;
  csrf?: ReactNode;
  replyToId?: string;
  replyPreview?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type QueuedMessage = { id: string; body: string; attachmentFileId: string | null; replyToId: string | null; attachmentName?: string };
  const queueKey = `enyd:message-outbox:${conversationId}`;
  const [outbox, setOutbox] = useState<QueuedMessage[]>([]);
  const [outboxReady, setOutboxReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(queueKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setOutbox(parsed.filter((item): item is QueuedMessage =>
          item && typeof item === 'object' &&
          typeof item.id === 'string' && item.id.length <= 64 &&
          typeof item.body === 'string' && item.body.length <= 4000 &&
          (item.attachmentFileId === null || typeof item.attachmentFileId === 'string') &&
          (item.replyToId === null || typeof item.replyToId === 'string'),
        ).slice(0, 10));
      }
    } catch {
      // Corrupt or unavailable browser storage must not block the composer.
    } finally {
      setOutboxReady(true);
    }
  }, [queueKey]);

  useEffect(() => {
    if (!outboxReady) return;
    try {
      if (outbox.length) window.sessionStorage.setItem(queueKey, JSON.stringify(outbox));
      else window.sessionStorage.removeItem(queueKey);
    } catch {
      setError('Browser storage is unavailable; keep this tab open until queued messages are sent.');
    }
  }, [outbox, outboxReady, queueKey]);

  // Drafts stay in this browser tab's session storage, never in the server DB.
  // Scope the key to the conversation and clear it only after a successful send.
  const draftKey = `enyd:message-draft:${conversationId}`;
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(draftKey);
      if (saved) setBody(saved.slice(0, 4000));
    } catch {
      // Storage may be disabled; the composer remains fully usable in memory.
    } finally {
      setDraftReady(true);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      if (body) window.sessionStorage.setItem(draftKey, body.slice(0, 4000));
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      // Quota/private-mode failures must never block message composition.
    }
  }, [body, draftKey, draftReady]);
  const [attachment, setAttachment] = useState<null | { fileId: string; name: string }>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function deliver(item: QueuedMessage) {
    setError(null);
    const token =
      document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value ?? '';
    const result = await onSendMessage(
      {
        conversationId,
        clientMessageId: item.id,
        body: item.body,
        attachmentFileId: item.attachmentFileId,
        replyToId: item.replyToId,
      },
      token,
    );
    if (!result.ok) {
      setError(result.message ?? 'That message is queued and was not sent.');
      return false;
    }
    setOutbox((current) => current.filter((queued) => queued.id !== item.id));
    router.refresh();
    return true;
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text && !attachment) return;
    if (outbox.length >= 10) {
      setError('Your offline outbox is full. Retry or discard a queued message first.');
      return;
    }
    const item: QueuedMessage = {
      id: crypto.randomUUID(),
      body: text,
      attachmentFileId: attachment?.fileId ?? null,
      replyToId: replyToId ?? null,
      attachmentName: attachment?.name,
    };
    setOutbox((current) => [...current, item]);
    // Move the content into the durable tab-scoped outbox immediately so a
    // reload cannot accidentally submit the same draft as a new message.
    setBody('');
    setAttachment(null);
    startTransition(async () => {
      await deliver(item);
    });
  }

  function retry(item: QueuedMessage) {
    startTransition(async () => {
      await deliver(item);
    });
  }

  function discard(item: QueuedMessage) {
    setOutbox((current) => current.filter((queued) => queued.id !== item.id));
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

      {outbox.length > 0 && (
        <section className="card-pad stack stack-2" aria-label="Queued messages">
          <p className="t-meta" role="status">{outbox.length} message{outbox.length === 1 ? '' : 's'} waiting to send</p>
          {outbox.map((item) => (
            <div className="row row-wrap" key={item.id}>
              <span className="t-small truncate" style={{ flex: 1 }}>{item.body || item.attachmentName || 'Attachment'}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !outboxReady} onClick={() => retry(item)}>Retry</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => discard(item)}>Discard</button>
            </div>
          ))}
        </section>
      )}

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

      {replyToId && replyPreview && (
        <div className="card-pad" aria-label="Replying to message">
          <p className="t-meta">Replying to</p>
          <p className="t-small">{replyPreview}</p>
          <a className="lnk" href={`/messages?c=${conversationId}`}>Cancel reply</a>
        </div>
      )}
      <div className="composer-tools">
        {csrf}
        <span className="t-meta" aria-live="polite">{body ? 'Draft saved in this tab' : ' '}</span>
        <input type="hidden" name="conversationId" value={conversationId} />
        {replyToId && <input type="hidden" name="replyToId" value={replyToId} />}
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
