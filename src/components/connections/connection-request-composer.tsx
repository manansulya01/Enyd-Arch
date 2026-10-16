'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendConnectionRequest } from '~/server/actions/connections';

export function ConnectionRequestComposer({ toUserId, csrfToken }: { toUserId: string; csrfToken: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'friendship' | 'collaboration'>('friendship');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit() {
    setBusy(true); setMessage(''); setSuccess(false);
    try {
      const result = await sendConnectionRequest({ toUserId, mode, note: note.trim(), csrf: csrfToken });
      if (result.ok) {
        setSuccess(true);
        setMessage('Request sent. The other member can accept or decline it.');
        router.refresh();
      } else setMessage(result.message ?? 'This member cannot receive that request.');
    } catch { setMessage('This member cannot receive that request.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel panel-body stack stack-3">
      <h2>Request a connection</h2>
      <p className="t-small t-muted">Requests are opt-in. The server checks both members’ settings, blocks, and safety rules before sending.</p>
      <label className="field"><span className="field-label">Connection type</span><select className="input" value={mode} onChange={(event) => setMode(event.target.value as 'friendship' | 'collaboration')}><option value="friendship">Friendship</option><option value="collaboration">Collaboration</option></select></label>
      <label className="field"><span className="field-label">Note (optional)</span><textarea className="input" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short, respectful introduction" /></label>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'Send request'}</button>
      {message && <p className={success ? 'notice notice-success' : 'notice notice-danger'} role="status">{message}</p>}
    </section>
  );
}
