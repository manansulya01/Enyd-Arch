'use server';

import { revalidatePath } from 'next/cache';
import { currentActor, revokeAllSessionsForUser } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { requestDeviceTransferAction } from './auth';

export async function revokeOtherSessions(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return;
  await revokeAllSessionsForUser(actor.userId, 'member_revoked_other_sessions', actor.deviceId);
  revalidatePath('/settings/security');
}

export async function submitDeviceTransferRequest(formData: FormData): Promise<void> {
  await requestDeviceTransferAction(null, formData);
  revalidatePath('/settings/security');
}
