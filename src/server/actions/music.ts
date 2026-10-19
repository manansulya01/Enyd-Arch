'use server';

import { and, asc, desc, eq, isNull } from 'drizzle-orm';
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


export async function moveMusicTrackInPlaylist(input: {
  playlistId: string;
  fileId: string;
  direction: 'up' | 'down';
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input.csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'upload')) return fail('Music is not available for this account.');
  if (input.direction !== 'up' && input.direction !== 'down') return fail('Choose a valid track position.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing your playlists.');

  const playlist = await authorizedPlaylist(input.playlistId, actor.userId);
  if (!playlist) return fail('That playlist is not available.');

  const moved = await db.transaction(async (tx) => {
    // Serialize all position changes for this playlist.
    const [locked] = await tx.select({ id: musicPlaylists.id })
      .from(musicPlaylists)
      .where(and(eq(musicPlaylists.id, playlist.id), eq(musicPlaylists.userId, actor.userId)))
      .for('update')
      .limit(1);
    if (!locked) return false;

    const rows = await tx.select({
      fileId: musicPlaylistTracks.fileId,
      position: musicPlaylistTracks.position,
    })
      .from(musicPlaylistTracks)
      .where(eq(musicPlaylistTracks.playlistId, playlist.id))
      .orderBy(asc(musicPlaylistTracks.position));
    const currentIndex = rows.findIndex((row) => row.fileId === input.fileId);
    const targetIndex = currentIndex + (input.direction === 'up' ? -1 : 1);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) return false;

    const current = rows[currentIndex]!;
    const target = rows[targetIndex]!;
    // Move through a temporary unused negative position to respect the
    // unique (playlist_id, position) index during both halves of the swap.
    const temporaryPosition = -Math.max(1, rows.length + 1);
    await tx.update(musicPlaylistTracks)
      .set({ position: temporaryPosition })
      .where(and(
        eq(musicPlaylistTracks.playlistId, playlist.id),
        eq(musicPlaylistTracks.fileId, current.fileId),
      ));
    await tx.update(musicPlaylistTracks)
      .set({ position: current.position })
      .where(and(
        eq(musicPlaylistTracks.playlistId, playlist.id),
        eq(musicPlaylistTracks.fileId, target.fileId),
      ));
    await tx.update(musicPlaylistTracks)
      .set({ position: target.position })
      .where(and(
        eq(musicPlaylistTracks.playlistId, playlist.id),
        eq(musicPlaylistTracks.fileId, current.fileId),
      ));
    await tx.update(musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlist.id));
    return true;
  });

  if (!moved) return fail('That track cannot move any further in this playlist.');
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
