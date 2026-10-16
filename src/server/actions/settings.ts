'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { profiles, userSettings } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';

const PROFILE_VISIBILITY = new Set(['public', 'members', 'connections', 'private']);
const MESSAGE_POLICIES = new Set(['members', 'connections', 'nobody']);
const THEMES = new Set(['dark', 'light']);

const checked = (formData: FormData, key: string) => formData.get(key) === 'on';

export async function savePrivacySettings(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const profileVisibility = String(formData.get('profileVisibility') ?? 'members');
  const messagePolicy = String(formData.get('messagePolicy') ?? 'members');
  const theme = String(formData.get('theme') ?? 'dark');

  if (!PROFILE_VISIBILITY.has(profileVisibility)) return fail('Choose a valid profile visibility.');
  if (!MESSAGE_POLICIES.has(messagePolicy)) return fail('Choose a valid message policy.');
  if (!THEMES.has(theme)) return fail('Choose a valid theme.');

  const values = {
    profileVisibility: profileVisibility as 'public' | 'members' | 'connections' | 'private',
    messagePolicy,
    theme,
    showActivity: checked(formData, 'showActivity'),
    showCreations: checked(formData, 'showCreations'),
    showArchiveContributions: checked(formData, 'showArchiveContributions'),
    discoverable: checked(formData, 'discoverable'),
    showRegion: checked(formData, 'showRegion'),
    searchableByEmail: false,
    connectionsEnabled: checked(formData, 'connectionsEnabled'),
    allowFriendRequests: checked(formData, 'allowFriendRequests'),
    hideAgeBand: checked(formData, 'hideAgeBand'),
    reduceMotion: checked(formData, 'reduceMotion'),
    notifyOnMessage: checked(formData, 'notifyOnMessage'),
    notifyOnReply: checked(formData, 'notifyOnReply'),
    notifyOnMention: checked(formData, 'notifyOnMention'),
    notifyOnReaction: checked(formData, 'notifyOnReaction'),
    notifyOnConnection: checked(formData, 'notifyOnConnection'),
    notifyOnProject: checked(formData, 'notifyOnProject'),
    notifyOnEvent: checked(formData, 'notifyOnEvent'),
    notifyOnFile: checked(formData, 'notifyOnFile'),
    notifyOnModeration: checked(formData, 'notifyOnModeration'),
    notifyEmailDigest: checked(formData, 'notifyEmailDigest'),
    updatedAt: new Date(),
  };

  await db.insert(userSettings)
    .values({ userId: actor.userId, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: values,
    });

  await db.insert(profiles)
    .values({ userId: actor.userId, profileVisibility: values.profileVisibility })
    .onConflictDoUpdate({ target: profiles.userId, set: { profileVisibility: values.profileVisibility, updatedAt: new Date() } });

  revalidatePath('/settings');
  revalidatePath('/home');
  revalidatePath('/connections');
  revalidatePath(`/profile/${actor.username}`);
  return ok();
}
