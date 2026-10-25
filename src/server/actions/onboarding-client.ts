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
import { verifyCsrfValue } from '~/server/csrf';
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

export async function onSaveIdentity(input: Parameters<typeof saveIdentity>[1], csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  return saveIdentity(await requireActor(), input);
}

export async function onSaveInterests(keys: string[], csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  return saveInterests(await requireActor(), keys);
}

export async function onSaveProfileDetail(
  input: Parameters<typeof saveProfileDetail>[1],
  csrf: string,
): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  return saveProfileDetail(await requireActor(), input);
}

export async function onSavePrivacy(input: Parameters<typeof savePrivacy>[1], csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  return savePrivacy(await requireActor(), input);
}

export async function onSaveConnections(
  input: Parameters<typeof saveConnections>[1],
  csrf: string,
): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  return saveConnections(await requireActor(), input);
}

export async function onCompleteOnboarding(csrf: string): Promise<ActionResult<{ username: string }>> {
  await verifyCsrfValue(csrf);
  return completeOnboarding(await requireActor());
}
