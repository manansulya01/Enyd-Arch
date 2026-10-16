'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '~db';
import { notifications } from '~db/schema';
import { currentActor } from '~/server/auth/session';
import { fail, ok, type ActionResult } from '~/lib/action-result';

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) return fail('Sign in to update notifications.');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Notification not found.');

  await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  revalidatePath('/notifications');
  revalidatePath('/home');
  return ok();
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) return fail('Sign in to update notifications.');

  await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  revalidatePath('/notifications');
  revalidatePath('/home');
  return ok();
}
