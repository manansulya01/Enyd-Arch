'use server';

import { revalidatePath } from 'next/cache';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { markAllRead, markRead } from '~/server/notify';

export async function markNotificationRead(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return;
  const id = String(formData.get('notificationId') ?? '');
  if (!id || id.length > 64) return;
  await markRead(actor.userId, id);
  revalidatePath('/notifications');
}

export async function markAllNotificationsRead(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return;
  await markAllRead(actor.userId);
  revalidatePath('/notifications');
}
