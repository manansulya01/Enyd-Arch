'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCommunityPost } from '~/server/actions/communities';

export function CommunityPostForm({ communityId, csrfToken }: { communityId: string; csrfToken: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function publish() {
    setBusy(true); setMessage('');
    try {
      const result = await createCommunityPost({ communityId, title, body, csrf: csrfToken });
      if (!result.ok) { setMessage(result.message ?? 'Could not publish post.'); return; }
      setTitle(''); setBody(''); setMessage('Published.'); router.refresh();
    } catch { setMessage('Could not publish post. Please try again.'); }
    finally { setBusy(false); }
  }

  return <section className="panel panel-body stack stack-3">
    <h2>Start a discussion</h2>
    <label className="field">
      <span className="field-label">Title (optional)</span>
      <input className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} />
    </label>
    <label className="field">
      <span className="field-label">Post</span>
      <textarea className="input" value={body} onChange={event => setBody(event.target.value)} maxLength={5000} rows={5} placeholder="Share a question, idea, or resource…" />
    </label>
    <button className="btn btn-primary" type="button" disabled={busy || !body.trim()} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish'}</button>
    {message && <p className="t-small" role="status">{message}</p>}
  </section>;
}
