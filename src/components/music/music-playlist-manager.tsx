'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addMusicTrackToPlaylist,
  createMusicPlaylist,
  deleteMusicPlaylist,
  removeMusicTrackFromPlaylist,
  moveMusicTrackInPlaylist,
} from '~/server/actions/music';
import type { MusicTrack } from './music-library';

export type MusicPlaylist = {
  id: string;
  name: string;
  tracks: Array<{ id: string; title: string }>;
};

export function MusicPlaylistManager({
  tracks,
  playlists,
  csrfToken,
}: {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState(tracks[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function create() {
    setBusy(true);
    setMessage('');
    try {
      const result = await createMusicPlaylist({ name, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not create playlist.');
        return;
      }
      setName('');
      setMessage('Playlist created.');
      router.refresh();
    } catch {
      setMessage('Could not create playlist. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function add(playlistId: string) {
    if (!selectedTrackId) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await addMusicTrackToPlaylist({ playlistId, fileId: selectedTrackId, csrf: csrfToken });
      setMessage(result.ok ? 'Track added if it was not already in the playlist.' : (result.message ?? 'Could not add track.'));
      if (result.ok) router.refresh();
    } catch {
      setMessage('Could not add track. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(playlistId: string, fileId: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await removeMusicTrackFromPlaylist({ playlistId, fileId, csrf: csrfToken });
      setMessage(result.ok ? 'Track removed.' : (result.message ?? 'Could not remove track.'));
      if (result.ok) router.refresh();
    } catch {
      setMessage('Could not remove track. Please try again.');
    } finally {
      setBusy(false);
    }
  }


  async function moveTrack(playlistId: string, fileId: string, direction: 'up' | 'down') {
    setBusy(true);
    setMessage('');
    try {
      const result = await moveMusicTrackInPlaylist({ playlistId, fileId, direction, csrf: csrfToken });
      setMessage(result.ok ? 'Playlist order updated.' : (result.message ?? 'Could not reorder track.'));
      if (result.ok) router.refresh();
    } catch {
      setMessage('Could not reorder track. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removePlaylist(playlistId: string, playlistName: string) {
    if (!window.confirm(`Delete “${playlistName}” and remove its saved track list?`)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await deleteMusicPlaylist({ playlistId, csrf: csrfToken });
      setMessage(result.ok ? 'Playlist deleted.' : (result.message ?? 'Could not delete playlist.'));
      if (result.ok) router.refresh();
    } catch {
      setMessage('Could not delete playlist. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack stack-3" aria-label="Music playlists">
      <div className="panel-head"><span className="t-label">Your playlists</span><span className="t-meta">Private by default</span></div>
      <div className="panel-body stack stack-2">
        <div className="row row-2">
          <label className="field grow">
            <span className="field-label">New playlist</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Late-night focus" />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => void create()} disabled={busy || !name.trim()}>Create</button>
        </div>
        {tracks.length > 0 && (
          <label className="field">
            <span className="field-label">Track to add</span>
            <select className="input" value={selectedTrackId} onChange={(event) => setSelectedTrackId(event.target.value)}>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
            </select>
          </label>
        )}
        {playlists.length === 0 ? (
          <p className="t-small t-muted">Create a playlist, then add tracks from your private audio library.</p>
        ) : playlists.map((playlist) => (
          <article className="panel panel-body stack stack-2" key={playlist.id}>
            <div className="row row-between">
              <h3>{playlist.name}</h3>
              <div className="row row-2">
                <span className="t-meta">{playlist.tracks.length} tracks</span>
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void removePlaylist(playlist.id, playlist.name)}>Delete playlist</button>
              </div>
            </div>
            {playlist.tracks.length === 0 ? <p className="t-meta">No tracks yet.</p> : (
              <ol className="stack stack-2">
                {playlist.tracks.map((track, index) => (
                  <li className="row row-between" key={track.id}>
                    <span className="t-small">{track.title}</span>
                    <div className="row row-2">
                      <button className="btn btn-ghost btn-sm" type="button" aria-label={`Move ${track.title} up`} disabled={busy || index === 0} onClick={() => void moveTrack(playlist.id, track.id, 'up')}>↑</button>
                      <button className="btn btn-ghost btn-sm" type="button" aria-label={`Move ${track.title} down`} disabled={busy || index === playlist.tracks.length - 1} onClick={() => void moveTrack(playlist.id, track.id, 'down')}>↓</button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void remove(playlist.id, track.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy || !selectedTrackId} onClick={() => void add(playlist.id)}>Add selected track</button>
          </article>
        ))}
        {message && <p className="t-small" role="status">{message}</p>}
      </div>
    </section>
  );
}
