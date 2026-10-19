'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { files, musicPlaylists, musicPlaylistTracks } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrfValue } from '~/server/csrf';

async function authorizedPlaylist(playlistId: string, userId: string) {
  const [playlist] = await db.select({ id: musicPlaylists.id })
    .from(musicPlaylists)
    .where(and(eq(musicPlaylists.id, playlistId), eq(musicPlaylists.userId, userId)))
    .limit(1);
  return playlist ?? null;
}

export async function createMusicPlaylist(input: {
  name: string;
  csrf: string;
}): Promise<ActionResult<{ playlistId: string }>> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'upload')) return fail('Music is not available for this account.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before creating another playlist.');

  const name = input.name.trim().replace(/[<>]/g, '').slice(0, 120);
  if (name.length < 1) return fail('Give the playlist a name.');

  const [created] = await db.insert(musicPlaylists).values({
    userId: actor.userId,
    name,
  }).returning({ id: musicPlaylists.id });
  if (!created) return fail('Could not create the playlist. Please try again.');
  revalidatePath('/music');
  return ok({ playlistId: created.id });
}

export async function addMusicTrackToPlaylist(input: {
  playlistId: string;
  fileId: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'upload')) return fail('Music is not available for this account.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing your playlists.');

  const playlist = await authorizedPlaylist(input.playlistId, actor.userId);
  if (!playlist) return fail('That playlist is not available.');

  const [file] = await db.select({ id: files.id, detectedMime: files.detectedMime })
    .from(files)
    .where(and(
      eq(files.id, input.fileId),
      eq(files.uploaderId, actor.userId),
      eq(files.state, 'clean'),
      isNull(files.removedAt),
    ))
    .limit(1);
  if (!file || !file.detectedMime?.startsWith('audio/')) {
    return fail('Choose a clean audio upload from your own library.');
  }

  // Lock this playlist row so simultaneous adds cannot allocate the same position.
  await db.transaction(async (tx) => {
    await tx.select({ id: musicPlaylists.id })
      .from(musicPlaylists)
      .where(and(eq(musicPlaylists.id, playlist.id), eq(musicPlaylists.userId, actor.userId)))
      .for('update');
    const [last] = await tx.select({ position: musicPlaylistTracks.position })
      .from(musicPlaylistTracks)
      .where(eq(musicPlaylistTracks.playlistId, playlist.id))
      .orderBy(desc(musicPlaylistTracks.position))
      .limit(1);
    await tx.insert(musicPlaylistTracks).values({
      playlistId: playlist.id,
      fileId: file.id,
      position: (last?.position ?? -1) + 1,
    }).onConflictDoNothing();
    await tx.update(musicPlaylists).set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlist.id));
  });

  revalidatePath('/music');
  return ok();
}

export async function removeMusicTrackFromPlaylist(input: {
  playlistId: string;
  fileId: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'upload')) return fail('Music is not available for this account.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing your playlists.');

  const playlist = await authorizedPlaylist(input.playlistId, actor.userId);
  if (!playlist) return fail('That playlist is not available.');

  await db.transaction(async (tx) => {
    await tx.select({ id: musicPlaylists.id })
      .from(musicPlaylists)
      .where(and(eq(musicPlaylists.id, playlist.id), eq(musicPlaylists.userId, actor.userId)))
      .for('update');
    await tx.delete(musicPlaylistTracks).where(and(
      eq(musicPlaylistTracks.playlistId, playlist.id),
      eq(musicPlaylistTracks.fileId, input.fileId),
    ));
    await tx.update(musicPlaylists).set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlist.id));
  });
  revalidatePath('/music');
  return ok();
}

export async function deleteMusicPlaylist(input: {
  playlistId: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'upload')) return fail('Music is not available for this account.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing your playlists.');

  const playlist = await authorizedPlaylist(input.playlistId, actor.userId);
  if (!playlist) return fail('That playlist is not available.');

  // Ownership predicate stays on the destructive query as a second boundary.
  const deleted = await db.delete(musicPlaylists).where(and(
    eq(musicPlaylists.id, playlist.id),
    eq(musicPlaylists.userId, actor.userId),
  )).returning({ id: musicPlaylists.id });
  if (deleted.length === 0) return fail('That playlist is no longer available.');
  revalidatePath('/music');
  return ok();
}
