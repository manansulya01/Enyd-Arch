'use client';

import type { ReactNode, FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { onCreateRegistryItem, onUpdateRegistryItem, onDeleteRegistryItem } from '~/server/actions/registry-client';

export interface RegistryEditorItem {
  id: string;
  title: string;
  description: string;
  details: string;
}

export function RegistryEditor({
  csrf,
  mode,
  item,
}: {
  csrf: ReactNode;
  mode: 'create' | 'edit';
  item?: RegistryEditorItem;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [details, setDetails] = useState(item?.details ?? '');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await onCreateRegistryItem(formData)
          : await onUpdateRegistryItem(formData);
      if (!result.ok) {
        setError(result.message ?? 'The Registry entry could not be saved.');
        return;
      }
      if (mode === 'create' && result.data?.id) {
        router.push(`/registry/${result.data.id}`);
        router.refresh();
        return;
      }
      if (item) {
        router.push(`/registry/${item.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form className="panel panel-body stack stack-4" onSubmit={submit}>
      {csrf}
      {mode === 'edit' && item && <input type="hidden" name="id" value={item.id} />}
      <div className="field">
        <label className="field-label" htmlFor="registry-title">Title</label>
        <input
          className="input"
          id="registry-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={2}
          maxLength={120}
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="registry-description">Description</label>
        <textarea
          className="textarea"
          id="registry-description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={5}
          maxLength={2000}
          required
          rows={4}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="registry-details">Details (optional)</label>
        <textarea
          className="textarea"
          id="registry-details"
          name="details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={10000}
          rows={6}
        />
      </div>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <div className="row row-wrap">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode === 'create' ? 'Create entry' : 'Save changes'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => router.back()} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RegistryDeleteButton({ slug, csrf }: { slug: string; csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm('Remove this Registry entry? This cannot be undone from the interface.')) return;
    const formData = new FormData();
    formData.set('id', slug);
    // The token is supplied by the server-rendered form below; avoid reading
    // arbitrary page state or putting CSRF material in a URL.
    const token = document.querySelector<HTMLInputElement>('input[name="__csrf"]')?.value ?? '';
    formData.set('__csrf', token);
    startTransition(async () => {
      const result = await onDeleteRegistryItem(formData);
      if (!result.ok) {
        setError(result.message ?? 'The entry could not be removed.');
        return;
      }
      router.push('/registry');
      router.refresh();
    });
  }

  return (
    <div className="stack stack-2">
      <div hidden>{csrf}</div>
      <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>
        {pending ? 'Removing…' : 'Remove entry'}
      </button>
      {error && <p className="t-danger" role="alert">{error}</p>}
    </div>
  );
}
