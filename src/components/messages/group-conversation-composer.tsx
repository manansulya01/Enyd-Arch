'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { onCreateGroup } from '~/server/actions/messages-client';

type ContactOption = { userId: string; username: string; displayName: string };

export function GroupConversationComposer({
  contacts,
  csrfToken,
}: {
  contacts: ContactOption[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function toggle(userId: string) {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : current.length < 11
          ? [...current, userId]
          : current,
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await onCreateGroup({
        title: title.trim(),
        memberUserIds: selected,
        csrf: csrfToken,
      });
      if (!result.ok || !result.data) {
        setMessage(result.message ?? 'The group could not be created.');
        return;
      }
      router.push(`/messages?c=${encodeURIComponent(result.data.conversationId)}`);
      router.refresh();
    } catch {
      setMessage('The group could not be created. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel">
      <summary className="panel-head" style={{ cursor: 'pointer' }}>
        <span className="t-label">Start a group</span>
        <span className="t-meta">Up to 12 members</span>
      </summary>
      <form className="panel-body stack stack-3" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Group name</span>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            minLength={2}
            required
            placeholder="e.g. Studio crew"
          />
        </label>
        {contacts.length === 0 ? (
          <p className="t-small t-muted">You need an accepted connection before you can invite them to a private group.</p>
        ) : (
          <>
            <p className="t-small t-muted">Choose accepted connections only. Everyone's current contact settings and blocks are checked again by the server.</p>
            <p className="t-meta">{selected.length} of 11 other members selected</p>
            <div className="stack stack-2" role="group" aria-label="Group members">
              {contacts.map((contact) => (
                <label className="row row-2" key={contact.userId}>
                  <input
                    type="checkbox"
                    checked={selected.includes(contact.userId)}
                    onChange={() => toggle(contact.userId)}
                    disabled={!selected.includes(contact.userId) && selected.length >= 11}
                  />
                  <span>
                    <span>{contact.displayName}</span>
                    <span className="t-meta"> @{contact.username}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        {message && <p className="field-error" role="alert">{message}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || contacts.length === 0}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </details>
  );
}
