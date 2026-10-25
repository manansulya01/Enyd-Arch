'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { onCreateArchiveObject, onUploadFile } from '~/server/actions/exchange-client';
import { ARCHIVE_CATEGORIES } from '~/lib/domain';
import { formatBytes } from '~/lib/format';

/**
 * Contributing an Archive object. The file is uploaded through the validated
 * pipeline first; the object record is then created referencing that file id,
 * so no bytes are ever handled as form data here.
 */
export function ArchiveObjectForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(ARCHIVE_CATEGORIES[0].key);
  const [tags, setTags] = useState('');
  const [attribution, setAttribution] = useState('');
  const [file, setFile] = useState<null | { fileId: string; name: string; size: number }>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickFile(chosen: File) {
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.set('__csrf', csrfToken);
    formData.set('file', chosen);
    try {
      const result = await onUploadFile(formData);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'That file was refused.');
        return;
      }
      setFile({ fileId: result.data.fileId, name: result.data.displayName, size: result.data.byteSize });
    } finally {
      setUploading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (title.trim().length < 2) {
      setError('Give the object a title.');
      return;
    }
    setBusy(true);
    startTransition(async () => {
      const result = await onCreateArchiveObject(
        {
          title: title.trim(),
          description: description.trim(),
          category,
          tags,
          attribution: attribution.trim(),
          fileId: file?.fileId ?? null,
        },
        csrfToken,
      );
      setBusy(false);
      if (!result.ok) {
        setError(result.message ?? 'That object could not be catalogued.');
        return;
      }
      router.push(`/archive/${result.data!.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="card card-pad-lg stack stack-4" onSubmit={submit}>
      <div className="stack stack-2">
        <span className="t-eyebrow">New Archive object</span>
        <p className="t-small t-muted">
          Anything worth keeping: notes, references, music, photographs, documents, discoveries.
          Upload only material you have the right to share.
        </p>
      </div>

      <label className="field">
        <span className="field-label">Title</span>
        <input
          className="input"
          value={title}
          maxLength={180}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <textarea
          className="textarea"
          rows={4}
          value={description}
          maxLength={4000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is it, why does it matter, and what does a member need to know to use it?"
        />
      </label>

      <div className="row row-2">
        <label className="field">
          <span className="field-label">Category</span>
          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            {ARCHIVE_CATEGORIES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Tags</span>
          <input
            className="input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="maps, transit, printing"
          />
          <span className="field-hint">Comma separated, up to eight.</span>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Attribution</span>
        <input
          className="input"
          value={attribution}
          maxLength={160}
          onChange={(event) => setAttribution(event.target.value)}
          placeholder="Original author, source, or your own note"
        />
      </label>

      <div className="field">
        <span className="field-label">File (optional)</span>
        <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
          <span className="act-glyph" aria-hidden="true">
            ⇄
          </span>
          {uploading ? 'Checking…' : file ? 'Choose a different file' : 'Attach a file'}
        </button>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.epub,.zip"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            if (chosen) void pickFile(chosen);
          }}
        />
        <span className="field-hint">
          Images, video, audio, PDF, plain text and Markdown are rendered in place. Anything else is
          offered as a download.
        </span>
        {file && (
          <p className="upload-row">
            <span className="upload-row-glyph" aria-hidden="true">
              ✓
            </span>
            <span className="truncate">{file.name}</span>
            <span className="t-meta">{formatBytes(file.size)}</span>
          </p>
        )}
      </div>

      {error && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            !
          </span>
          <span className="notice-body">{error}</span>
        </p>
      )}

      <div className="row row-end">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Cataloguing…' : 'Catalogue this object'}
        </button>
      </div>
    </form>
  );
}

