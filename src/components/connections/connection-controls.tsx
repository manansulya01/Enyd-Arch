'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendConnectionRequest, respondToRequest } from '~/server/actions/connections';

export function ConnectionRequestForm({ toUserId }: { toUserId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'friendship' | 'collaboration' | 'dating'>('friendship');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendConnectionRequest({ toUserId, mode, note });
      setMessage(result.ok ? 'Request sent. The other member decides whether to accept.' : result.message ?? 'The request could not be sent.');
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel panel-body stack stack-3">
      <h2 className="t-heading">Request a connection</h2>
      <label className="field">
        <span className="field-label">What kind of connection?</span>
        <select className="select" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="friendship">Friendship</option>
          <option value="collaboration">Collaboration</option>
          <option value="dating">Dating (adult opt-in only)</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Optional note</span>
        <textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Say hello, without sharing private contact details." />
      </label>
      <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>{pending ? 'Sending…' : 'Send request'}</button>
      {message && <p role="status" className="t-small">{message}</p>}
    </section>
  );
}

export function ConnectionResponseButton({ requestId, accept }: { requestId: string; accept: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="stack stack-1">
      <button type="button" className={accept ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} disabled={pending} onClick={() => startTransition(async () => {
        const result = await respondToRequest(requestId, accept);
        if (!result.ok) {
          setMessage(result.message ?? 'Could not update the request.');
          return;
        }
        router.refresh();
      })}>{pending ? 'Saving…' : accept ? 'Accept' : 'Decline'}</button>
      {message && <p className="t-danger" role="alert">{message}</p>}
    </div>
  );
}
