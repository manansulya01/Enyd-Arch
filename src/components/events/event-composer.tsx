'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent } from '~/server/actions/events';
import { fieldError } from '~/lib/action-result';

export function EventComposer({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [result, action, pending] = useActionState(createEvent, null);

  useEffect(() => {
    if (result?.ok && result.data?.slug) router.push('/events/' + result.data.slug);
  }, [result, router]);

  return (
    <form action={action} className="panel panel-body stack-3">
      <h2>Create a gathering</h2>
      <input type="hidden" name="__csrf" value={csrfToken} />
      <label className="field">
        <span className="field-label">Title</span>
        <input className="input" name="title" required minLength={2} maxLength={180} placeholder="Friday study circle" />
        {fieldError(result, 'title') && <span className="field-error">{fieldError(result, 'title')}</span>}
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="input" name="description" rows={3} maxLength={4000} placeholder="What should members know?" />
      </label>
      <div className="row row-3">
        <label className="field">
          <span className="field-label">Kind</span>
          <select className="input" name="kind" defaultValue="community">
            <option value="community">Community gathering</option>
            <option value="study_session">Study session</option>
            <option value="movie_night">Movie night</option>
            <option value="game_night">Game night</option>
            <option value="competition">Competition</option>
            <option value="creative_challenge">Creative challenge</option>
            <option value="game_jam">Game jam</option>
            <option value="archive_event">Archive event</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Starts</span>
          <input className="input" type="datetime-local" name="startsAt" required />
          {fieldError(result, 'startsAt') && <span className="field-error">{fieldError(result, 'startsAt')}</span>}
        </label>
        <label className="field">
          <span className="field-label">Capacity (optional)</span>
          <input className="input" type="number" name="capacity" min={1} max={10000} placeholder="No limit" />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Location or meeting link</span>
        <input className="input" name="location" maxLength={200} placeholder="Library room 2 / online" />
      </label>
      {result?.message && !result.ok && <p className="notice notice-danger" role="alert">{result.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create event'}</button>
    </form>
  );
}
