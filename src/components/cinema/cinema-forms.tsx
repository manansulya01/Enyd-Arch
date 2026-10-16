'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addFilm, reviewFilm, toggleWatchlist } from '~/server/actions/cinema';

export function FilmCreateForm({ csrf }: { csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await addFilm(null, data);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The film could not be added.');
        return;
      }
      router.push(`/cinema/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <label className="field"><span className="field-label">Film title</span><input className="input" name="title" maxLength={180} required /></label>
      <label className="field"><span className="field-label">Year</span><input className="input" name="year" type="number" min={1801} max={2199} /></label>
      <label className="field"><span className="field-label">Director</span><input className="input" name="director" maxLength={120} /></label>
      <label className="field"><span className="field-label">Synopsis</span><textarea className="textarea" name="synopsis" maxLength={4000} rows={4} /></label>
      <label className="field"><span className="field-label">Official watch link (optional)</span><input className="input" name="watchUrl" type="url" placeholder="https://…" /></label>
      <label className="field"><span className="field-label">Runtime in minutes</span><input className="input" name="runtimeMinutes" type="number" min={1} max={1000} /></label>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? 'Adding…' : 'Add film'}</button>
    </form>
  );
}

export function FilmReviewForm({ filmId, csrf, initialRating = 7 }: { filmId: string; csrf: ReactNode; initialRating?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set('filmId', filmId);
    startTransition(async () => {
      const result = await reviewFilm(null, data);
      if (!result.ok) {
        setError(result.message ?? 'Your review could not be saved.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <h2 className="t-heading">Your review</h2>
      <label className="field"><span className="field-label">Rating (0–10)</span><input className="input" type="number" name="rating" min={0} max={10} step={0.5} defaultValue={initialRating} required /></label>
      <label className="field"><span className="field-label">Review</span><textarea className="textarea" name="body" maxLength={4000} rows={4} /></label>
      <label className="row row-2"><input type="checkbox" name="spoilers" /><span className="t-small">Contains spoilers</span></label>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save review'}</button>
    </form>
  );
}

export function WatchlistButton({ filmId }: { filmId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack stack-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => startTransition(async () => {
        const result = await toggleWatchlist(filmId);
        if (!result.ok) {
          setError(result.message ?? 'The watchlist could not be updated.');
          return;
        }
        router.refresh();
      })}>{pending ? 'Saving…' : 'Toggle watchlist'}</button>
      {error && <p className="t-danger" role="alert">{error}</p>}
    </div>
  );
}
