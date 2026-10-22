'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { profiles, userSettings } from '~db/schema';
import { currentActor, can } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';

const VISIBILITIES = new Set(['public', 'members', 'connections', 'private']);
const MESSAGE_POLICIES = new Set(['everyone', 'members', 'connections', 'nobody']);

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on';
}

/** Persist privacy controls from the authenticated settings form. */
export async function savePrivacySettings(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'read')) redirect('/settings/privacy?error=unavailable');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/settings/privacy?error=slow-down');

  const profileVisibility = String(formData.get('profileVisibility') ?? 'members');
  const messagePolicy = String(formData.get('messagePolicy') ?? 'members');
  if (!VISIBILITIES.has(profileVisibility) || !MESSAGE_POLICIES.has(messagePolicy)) {
    redirect('/settings/privacy?error=invalid');
  }

  const values = {
    profileVisibility: profileVisibility as 'public' | 'members' | 'connections' | 'private',
    discoverable: checked(formData, 'discoverable'),
    showRegion: checked(formData, 'showRegion'),
    hideAgeBand: checked(formData, 'hideAgeBand'),
    messagePolicy,
    updatedAt: new Date(),
  };

  await db
    .insert(userSettings)
    .values({ userId: actor.userId, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: values,
    });

  await db.update(profiles)
    .set({ profileVisibility: values.profileVisibility, updatedAt: new Date() })
    .where(eq(profiles.userId, actor.userId));

  revalidatePath('/settings/privacy');
  revalidatePath('/network');
  revalidatePath('/commons');
  redirect('/settings/privacy?saved=1');
}
