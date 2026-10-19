'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleMusicLike } from '~/server/actions/music';

export type MusicTrack = {
  id: string;
  title: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export type MusicPlaylistOption = {
  id: string;
  name: string;
  tracks: MusicTrack[];
};

export function MusicLibrary({
  tracks,
  playlists = [],
  likedTrackIds = [],
  csrfToken,
}: {
  tracks: MusicTrack[];
  playlists?: MusicPlaylistOption[];
  likedTrackIds?: string[];
  csrfToken: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const router = useRouter();
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set(likedTrackIds));
  const [likeMessage, setLikeMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('library');
  const [currentId, setCurrentId] = useState<string | null>(tracks[0]?.id ?? null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const playbackTracks = useMemo(() => {
    if (selectedPlaylistId === 'library') return tracks;
    if (selectedPlaylistId === 'liked') return tracks.filter((track) => likedIds.has(track.id));
    return playlists.find((playlist) => playlist.id === selectedPlaylistId)?.tracks ?? [];
  }, [tracks, playlists, selectedPlaylistId, likedIds]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return playbackTracks.filter((track) => !q || track.title.toLocaleLowerCase().includes(q));
  }, [playbackTracks, query]);
  const current = playbackTracks.find((track) => track.id === currentId) ?? playbackTracks[0] ?? null;

  function changePlaylist(playlistId: string) {
    setSelectedPlaylistId(playlistId);
    const nextTracks = playlistId === 'library'
      ? tracks
      : playlistId === 'liked'
        ? tracks.filter((track) => likedIds.has(track.id))
        : playlists.find((playlist) => playlist.id === playlistId)?.tracks ?? [];
    setCurrentId(nextTracks[0]?.id ?? null);
    setQuery('');
  }

  async function toggleLike(track: MusicTrack) {
    setLikeMessage('');
    const result = await toggleMusicLike({ fileId: track.id, csrf: csrfToken });
    if (!result.ok || !result.data) {
      setLikeMessage(result.message ?? 'Could not update liked songs.');
      return;
    }
    setLikedIds((current) => {
      const next = new Set(current);
      if (result.data!.liked) next.add(track.id);
      else next.delete(track.id);
      return next;
    });
    router.refresh();
  }

  function choose(track: MusicTrack) {
    setCurrentId(track.id);
    window.setTimeout(() => void audio.current?.play().catch(() => undefined), 0);
  }

  function move(step: number) {
    if (!playbackTracks.length) return;
    const currentIndex = Math.max(0, playbackTracks.findIndex((track) => track.id === current?.id));
    const nextIndex = shuffle
      ? (playbackTracks.length > 1 ? (currentIndex + 1 + Math.floor(Math.random() * (playbackTracks.length - 1))) % playbackTracks.length : currentIndex)
      : (currentIndex + step + playbackTracks.length) % playbackTracks.length;
    setCurrentId(playbackTracks[nextIndex]!.id);
    window.setTimeout(() => void audio.current?.play().catch(() => undefined), 0);
  }

  return (
    <div className="stack stack-4">
      <div className="stack stack-2">
        <label className="field">
          <span className="field-label">Play from</span>
          <select className="input" value={selectedPlaylistId} onChange={(event) => changePlaylist(event.target.value)}>
            <option value="library">All my audio</option>
            <option value="liked">Liked songs</option>
            {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Search {selectedPlaylistId === 'library' ? 'your audio' : 'this playlist'}</span>
          <input className="input input-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file names…" />
        </label>
      </div>
      {tracks.length === 0 && !playlists.some((playlist) => playlist.tracks.length > 0) ? (
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
              <p className="t-small t-muted">{selectedPlaylistId === 'library' ? 'Personal audio library' : selectedPlaylistId === 'liked' ? 'Liked songs' : playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name ?? 'Playlist'} · private to your account</p>
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
              {current && <button className={likedIds.has(current.id) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-pressed={likedIds.has(current.id)} onClick={() => void toggleLike(current)}>{likedIds.has(current.id) ? '♥ Liked' : '♡ Like track'}</button>}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => move(-1)} disabled={!current}>Previous</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => move(1)} disabled={!current}>Next</button>
              <button className={shuffle ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-pressed={shuffle} onClick={() => setShuffle((value) => !value)}>Shuffle {shuffle ? 'on' : 'off'}</button>
              <button className={repeat ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-pressed={repeat} onClick={() => setRepeat((value) => !value)}>Repeat {repeat ? 'on' : 'off'}</button>
            </div>
            {likeMessage && <p className="t-small" role="status">{likeMessage}</p>}
          </section>
          <section className="panel" aria-label="Your tracks">
            <div className="panel-head"><span className="t-label">{selectedPlaylistId === 'library' ? 'Your tracks' : 'Playlist tracks'}</span><span className="t-meta">{visible.length} shown</span></div>
            {visible.length === 0 ? <p className="panel-body t-small t-muted">{playbackTracks.length ? 'No tracks match your search.' : 'This playlist has no available tracks yet.'}</p> : (
              <ol className="list-plain">
                {visible.map((track, index) => (
                  <li key={track.id} className="row row-3 panel-body" style={{ borderTop: index ? '1px solid var(--line)' : undefined }}>
                    <button className={track.id === current?.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" onClick={() => choose(track)} aria-label={`Play ${track.title}`}>
                      {track.id === current?.id ? 'Selected' : 'Play'}
                    </button>
                    <div className="grow">
                      <p className="t-small">{track.title}</p>
                      <p className="t-meta">{track.mime} · {formatBytes(track.bytes)} · Added {new Date(track.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button className={likedIds.has(track.id) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="button" aria-label={likedIds.has(track.id) ? `Unlike ${track.title}` : `Like ${track.title}`} aria-pressed={likedIds.has(track.id)} onClick={() => void toggleLike(track)}>{likedIds.has(track.id) ? '♥' : '♡'}</button>
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
