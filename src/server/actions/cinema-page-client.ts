'use server';

import { revalidatePath } from 'next/cache';
import { reviewFilm, commentOnFilm } from './cinema';

export async function submitFilmReview(formData: FormData): Promise<void> {
  await reviewFilm(null, formData);
  revalidatePath('/cinema');
}

export async function submitFilmComment(formData: FormData): Promise<void> {
  await commentOnFilm(null, formData);
}
