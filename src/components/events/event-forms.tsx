'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EVENT_KINDS } from '~/lib/domain';
import { createEvent, rsvpToEvent } from '~/server/actions/events';

export function EventCreateForm({ csrf }: { csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const localStart = String(data.get('startsAt') ?? '');
    if (localStart) {
      const date = new Date(localStart);
      if (!Number.isNaN(date.getTime())) data.set('startsAt', date.toISOString());
    }
    startTransition(async () => {
      const result = await createEvent(null, data);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The event could not be created.');
        return;
      }
      router.push(`/events/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <label className="field">
        <span className="field-label">Title</span>
        <input className="input" name="title" minLength={2} maxLength={180} required />
      </label>
      <label className="field">
        <span className="field-label">Type</span>
        <select className="select" name="kind" defaultValue="community">
          {EVENT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="textarea" name="description" maxLength={4000} rows={3} />
      </label>
      <label className="field">
        <span className="field-label">Start time (your local time)</span>
        <input className="input" type="datetime-local" name="startsAt" required />
      </label>
      <label className="field">
        <span className="field-label">Location (optional)</span>
        <input className="input" name="location" maxLength={200} placeholder="Online, a campus room, or a general area" />
      </label>
      <label className="field">
        <span className="field-label">Capacity (optional)</span>
        <input className="input" type="number" name="capacity" min={1} max={10000} />
      </label>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create event'}
      </button>
    </form>
  );
}

export function EventRsvpButtons({ eventId, current }: { eventId: string; current: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(status: 'going' | 'interested' | 'declined') {
    setError(null);
    startTransition(async () => {
      const result = await rsvpToEvent(eventId, status);
      if (!result.ok) {
        setError(result.message ?? 'Your RSVP could not be saved.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="stack stack-2">
      <div className="row row-wrap">
        {(['going', 'interested', 'declined'] as const).map((status) => (
          <button key={status} type="button" className={current === status ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} disabled={pending} onClick={() => choose(status)}>
            {pending ? 'Saving…' : status === 'going' ? 'Going' : status === 'interested' ? 'Interested' : current === 'declined' ? 'Not going' : 'Decline'}
          </button>
        ))}
      </div>
      {error && <p className="t-danger" role="alert">{error}</p>}
    </div>
  );
}
