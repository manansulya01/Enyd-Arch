'use server';

/**
 * Browser-facing onboarding actions.
 *
 * The core logic in ./onboarding takes the resolved actor because it is also
 * called from server code. These wrappers are the surface a client component
 * may call: they resolve the actor from the session themselves, so a browser
 * can never claim to be someone else.
 */
import { redirect } from 'next/navigation';
import { currentActor } from '~/server/auth/session';
import {
  completeOnboarding,
  saveConnections,
  saveIdentity,
  saveInterests,
  savePrivacy,
  saveProfileDetail,
} from './onboarding';
import type { ActionResult } from '~/lib/action-result';

async function requireActor() {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  return actor;
}

export async function onSaveIdentity(input: Parameters<typeof saveIdentity>[1]): Promise<ActionResult> {
  return saveIdentity(await requireActor(), input);
}

export async function onSaveInterests(keys: string[]): Promise<ActionResult> {
  return saveInterests(await requireActor(), keys);
}

export async function onSaveProfileDetail(
  input: Parameters<typeof saveProfileDetail>[1],
): Promise<ActionResult> {
  return saveProfileDetail(await requireActor(), input);
}

export async function onSavePrivacy(input: Parameters<typeof savePrivacy>[1]): Promise<ActionResult> {
  return savePrivacy(await requireActor(), input);
}

export async function onSaveConnections(
  input: Parameters<typeof saveConnections>[1],
): Promise<ActionResult> {
  return saveConnections(await requireActor(), input);
}

export async function onCompleteOnboarding(): Promise<ActionResult<{ username: string }>> {
  return completeOnboarding(await requireActor());
}
