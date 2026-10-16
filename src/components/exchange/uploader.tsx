'use client';

import { useRef, useState } from 'react';
import { onUploadFile } from '~/server/actions/exchange-client';
import { formatBytes } from '~/lib/format';

/**
 * The Exchange upload panel. Validation findings from the server are shown
 * verbatim — a refused file explains why rather than failing silently.
 */
export function ExchangeUploader({ csrfToken }: { csrfToken: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { state: 'ok'; name: string; size: number } | { state: 'error'; message: string }
  | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    const formData = new FormData();
    formData.set('__csrf', csrfToken);
    formData.set('file', file);
    try {
      const outcome = await onUploadFile(formData);
      if (outcome.ok && outcome.data) {
        setResult({ state: 'ok', name: outcome.data.displayName, size: outcome.data.byteSize });
      } else {
        setResult({ state: 'error', message: outcome.message ?? 'That file was refused.' });
      }
    } catch {
      setResult({ state: 'error', message: 'The upload could not be completed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad-lg stack stack-4">
      <div className="stack stack-2">
        <span className="t-eyebrow">Upload</span>
        <h2 className="t-section">Bring something in</h2>
      </div>

      <div
        className={`exchange-drop${drag ? ' is-drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <span className="exchange-glyph" aria-hidden="true">
          ⇄
        </span>
        <p>
          Drop a file here, or{' '}
          <button type="button" className="lnk" onClick={() => inputRef.current?.click()} disabled={busy}>
            choose one
          </button>
          . Up to 100 MB.
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.rtf,.epub,.zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>

      {busy && (
        <p className="t-small t-subtle" role="status">
          <span className="spinner" aria-hidden="true" /> Checking the file…
        </p>
      )}

      {result?.state === 'ok' && (
        <p className="notice notice-success" role="status">
          <span className="notice-glyph" aria-hidden="true">
            ✓
          </span>
          <span className="notice-body">
            {result.name} ({formatBytes(result.size)}) accepted. Attach it to a post, an Archive
            object, or a project resource to make it visible to others.
          </span>
        </p>
      )}

      {result?.state === 'error' && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            !
          </span>
          <span className="notice-body">{result.message}</span>
        </p>
      )}
    </section>
  );
}

