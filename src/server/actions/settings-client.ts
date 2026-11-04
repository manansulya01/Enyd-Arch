'use server';

import { revalidatePath } from 'next/cache';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { savePrivacy } from './onboarding';

const VISIBILITY = ['public', 'members', 'connections', 'private'] as const;
const MESSAGE_POLICY = ['everyone', 'members', 'connections', 'nobody'] as const;

export async function savePrivacySettings(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return;

  const profileVisibility = String(formData.get('profileVisibility') ?? '');
  const messagePolicy = String(formData.get('messagePolicy') ?? '');
  if (!VISIBILITY.includes(profileVisibility as (typeof VISIBILITY)[number])) return;
  if (!MESSAGE_POLICY.includes(messagePolicy as (typeof MESSAGE_POLICY)[number])) return;

  await savePrivacy(actor, {
    profileVisibility: profileVisibility as (typeof VISIBILITY)[number],
    messagePolicy: messagePolicy as (typeof MESSAGE_POLICY)[number],
    discoverable: formData.get('discoverable') === 'on',
    showActivity: formData.get('showActivity') === 'on',
    showCreations: formData.get('showCreations') === 'on',
    showArchiveContributions: formData.get('showArchiveContributions') === 'on',
    showRegion: formData.get('showRegion') === 'on',
  });
  revalidatePath('/settings');
  revalidatePath(`/members/${actor.username}`);
}
