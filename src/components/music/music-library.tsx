'use client';

import { useMemo, useRef, useState } from 'react';

export type MusicTrack = {
  id: string;
  title: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export function MusicLibrary({ tracks }: { tracks: MusicTrack[] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(tracks[0]?.id ?? null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return tracks.filter((track) => !q || track.title.toLocaleLowerCase().includes(q));
  }, [tracks, query]);
  const current = tracks.find((track) => track.id === currentId) ?? null;

  function choose(track: MusicTrack) {
    setCurrentId(track.id);
    window.setTimeout(() => void audio.current?.play().catch(() => undefined), 0);
  }

  function move(step: number) {
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentId));
    const nextIndex = shuffle
      ? Math.floor(Math.random() * tracks.length)
      : (currentIndex + step + tracks.length) % tracks.length;
    setCurrentId(tracks[nextIndex]!.id);
    window.setTimeout(() => void audio.current?.play().catch(() => undefined), 0);
  }

  return (
    <div className="stack stack-4">
      <label className="field">
        <span className="field-label">Search your audio</span>
        <input className="input input-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file names…" />
      </label>
      {tracks.length === 0 ? (
        <div className="panel panel-body stack stack-2">
          <h2>Your library is empty</h2>
          <p className="t-small t-muted">Upload an audio file in The Exchange first. Only clean audio files you own appear here; nothing is public by default.</p>
          <a className="btn btn-primary btn-sm" href="/exchange">Open The Exchange</a>
        </div>
      ) : (
        <>
          <section className="panel panel-body stack stack-3" aria-label="Audio player">
            <div>
              <p className="t-meta">NOW SELECTED</p>
              <h2>{current?.title ?? 'Choose a track'}</h2>
              <p className="t-small t-muted">Personal audio library · private to your account</p>
            </div>
            <audio
              ref={audio}
              controls
              preload="metadata"
              src={current ? `/files/${current.id}` : undefined}
              onEnded={() => repeat ? void audio.current?.play() : move(1)}
              style={{ width: '100%' }}
            />
            <div className="row row-wrap row-2">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => move(-1)} disabled={!current}>Previous</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => move(1)} disabled={!current}>Next</button>
              <button className={shuffle ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-pressed={shuffle} onClick={() => setShuffle((value) => !value)}>Shuffle {shuffle ? 'on' : 'off'}</button>
              <button className={repeat ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-pressed={repeat} onClick={() => setRepeat((value) => !value)}>Repeat {repeat ? 'on' : 'off'}</button>
            </div>
          </section>
          <section className="panel" aria-label="Your tracks">
            <div className="panel-head"><span className="t-label">Your tracks</span><span className="t-meta">{visible.length} shown</span></div>
            {visible.length === 0 ? <p className="panel-body t-small t-muted">No matching tracks.</p> : (
              <ol className="list-plain">
                {visible.map((track, index) => (
                  <li key={track.id} className="row row-3 panel-body" style={{ borderTop: index ? '1px solid var(--line)' : undefined }}>
                    <button className={track.id === currentId ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" onClick={() => choose(track)} aria-label={`Play ${track.title}`}>
                      {track.id === currentId ? 'Playing' : 'Play'}
                    </button>
                    <div className="grow">
                      <p className="t-small">{track.title}</p>
                      <p className="t-meta">{track.mime} · {formatBytes(track.bytes)} · Added {new Date(track.createdAt).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
