'use server';

import { revalidatePath } from 'next/cache';
import { verifyCsrf } from '~/server/csrf';
import { toggleWatchlist } from './cinema';

export async function toggleFilmWatchlist(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const filmId = String(formData.get('filmId') ?? '');
  if (!filmId || filmId.length > 64) return;
  await toggleWatchlist(filmId);
  revalidatePath('/cinema');
}
