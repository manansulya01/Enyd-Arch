'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createGalleryPost } from '~/server/actions/gallery';
import { GALLERY_KINDS } from '~/lib/domain';

export function GalleryComposer({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [result, action, pending] = useActionState(createGalleryPost, null);

  useEffect(() => {
    if (result?.ok && result.data?.slug) router.push('/gallery/' + result.data.slug);
  }, [result, router]);

  return (
    <form action={action} className="panel panel-body stack-3">
      <h2>Share a piece</h2>
      <input type="hidden" name="__csrf" value={csrfToken} />
      <label className="field"><span className="field-label">Title</span><input className="input" name="title" required minLength={2} maxLength={180} /></label>
      <label className="field"><span className="field-label">Medium</span><select className="input" name="kind" defaultValue="writing">{GALLERY_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
      <label className="field"><span className="field-label">Caption</span><textarea className="input" name="caption" rows={2} maxLength={2000} /></label>
      <label className="field"><span className="field-label">Writing or artist statement</span><textarea className="input" name="body" rows={5} maxLength={20000} placeholder="For writing, add at least 40 characters. For other media, describe your piece." /></label>
      <label className="field"><span className="field-label">Uploaded file IDs (optional for writing)</span><input className="input" name="fileIds" maxLength={400} placeholder="Paste clean upload IDs from the Exchange, separated by commas" /><span className="field-hint">Media must be uploaded through the Exchange first.</span></label>
      {result?.message && !result.ok && <p className="notice notice-danger" role="alert">{result.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Publishing…' : 'Publish piece'}</button>
    </form>
  );
}
