import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import { db } from '~db';
import { files, musicPlaylistTracks, musicPlaylists } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { MusicLibrary } from '~/components/music/music-library';
import { MusicPlaylistManager } from '~/components/music/music-playlist-manager';
import { requireCapability } from '~/server/guard';
import { recentFilesForUser } from '~/server/storage/uploads';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Music' };

export default async function MusicPage() {
  const { actor } = await requireCapability('upload');
  const [recent, playlistRows, csrfToken] = await Promise.all([
    recentFilesForUser(actor.userId, 100),
    db.select({ id: musicPlaylists.id, name: musicPlaylists.name })
      .from(musicPlaylists)
      .where(eq(musicPlaylists.userId, actor.userId))
      .orderBy(desc(musicPlaylists.updatedAt)),
    sessionCsrfToken(),
  ]);
  const tracks = recent
    .filter((file) => file.detectedMime?.startsWith('audio/') && !file.removedAt)
    .map((file) => ({
      id: file.id,
      title: file.displayName,
      mime: file.detectedMime ?? 'audio/unknown',
      bytes: file.byteSize,
      createdAt: file.createdAt.toISOString(),
    }));

  const allPlaylistTrackRows = playlistRows.length === 0 ? [] : await db.select({
    playlistId: musicPlaylistTracks.playlistId,
    id: files.id,
    title: files.displayName,
  })
    .from(musicPlaylistTracks)
    .innerJoin(files, eq(files.id, musicPlaylistTracks.fileId))
    .where(and(
      inArray(musicPlaylistTracks.playlistId, playlistRows.map((playlist) => playlist.id)),
      eq(files.state, 'clean'),
      isNull(files.removedAt),
      like(files.detectedMime, 'audio/%'),
    ))
    .orderBy(asc(musicPlaylistTracks.position));
  const playlists = playlistRows.map((playlist) => ({
    ...playlist,
    tracks: allPlaylistTrackRows.filter((track) => track.playlistId === playlist.id),
  }));

  return (
    <PageShell
      title="Music"
      sub="A private player for audio you have uploaded and are allowed to use. Publishing, playlists, artist profiles and licensed catalogue streaming are planned separately."
      wide
      actions={<Link className="btn btn-secondary btn-sm" href="/exchange">Upload audio</Link>}
    >
      <div className="stack stack-4">
        <MusicLibrary tracks={tracks} />
        <MusicPlaylistManager tracks={tracks} playlists={playlists} csrfToken={csrfToken} />
      </div>
      <p className="t-meta" style={{ marginTop: 'var(--sp-4)' }}>
        Only your clean audio uploads are listed. Enyd Arch does not rip or provide a commercial streaming catalogue.
      </p>
    </PageShell>
  );
}
