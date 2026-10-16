'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { notificationTable } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { verifyCsrfValue } from '~/server/csrf';

export async function markNotificationRead(id: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('That notification could not be found.');

  await db.update(notificationTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(notificationTable.id, id),
      eq(notificationTable.userId, actor.userId),
      isNull(notificationTable.readAt),
    ));
  revalidatePath('/notifications');
  return ok();
}
