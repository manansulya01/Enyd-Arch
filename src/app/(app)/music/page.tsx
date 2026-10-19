import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { MusicLibrary } from '~/components/music/music-library';
import { requireCapability } from '~/server/guard';
import { recentFilesForUser } from '~/server/storage/uploads';

export const metadata: Metadata = { title: 'Music' };

export default async function MusicPage() {
  const { actor } = await requireCapability('upload');
  const recent = await recentFilesForUser(actor.userId, 100);
  const tracks = recent
    .filter((file) => file.detectedMime?.startsWith('audio/') && !file.removedAt)
    .map((file) => ({
      id: file.id,
      title: file.displayName,
      mime: file.detectedMime ?? 'audio/unknown',
      bytes: file.byteSize,
      createdAt: file.createdAt.toISOString(),
    }));

  return (
    <PageShell
      title="Music"
      sub="A private player for audio you have uploaded and are allowed to use. Publishing, playlists, artist profiles and licensed catalogue streaming are planned separately."
      wide
      actions={<Link className="btn btn-secondary btn-sm" href="/exchange">Upload audio</Link>}
    >
      <MusicLibrary tracks={tracks} />
      <p className="t-meta" style={{ marginTop: 'var(--sp-4)' }}>
        Only your clean audio uploads are listed. Enyd Arch does not rip or provide a commercial streaming catalogue.
      </p>
    </PageShell>
  );
}
