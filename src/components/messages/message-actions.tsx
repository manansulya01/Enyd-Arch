'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { editMessage, removeMessage } from '~/server/actions/messages';

export function MessageActions({
  messageId,
  body,
  csrfToken,
  canEdit,
}: {
  messageId: string;
  body: string;
  csrfToken: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const result = await editMessage({ messageId, body: draft, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not edit message.');
        return;
      }
      setEditing(false);
      setMessage('Message updated.');
      router.refresh();
    } catch {
      setMessage('Could not edit message. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Remove this message for everyone in the conversation?')) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await removeMessage({ messageId, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not remove message.');
        return;
      }
      setMessage('Message removed.');
      router.refresh();
    } catch {
      setMessage('Could not remove message. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack-1">
      {editing ? (
        <div className="stack stack-2">
          <label className="field">
            <span className="field-label">Edit message</span>
            <textarea className="input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} />
          </label>
          <div className="row">
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy || !draft.trim()} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save edit'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => { setDraft(body); setEditing(false); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          {canEdit && <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => { setDraft(body); setEditing(true); }}>Edit</button>}
          <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void remove()}>Remove</button>
        </div>
      )}
      {message && <p className="t-meta" role="status">{message}</p>}
    </div>
  );
}
