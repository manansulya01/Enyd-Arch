'use server';

import { revalidatePath } from 'next/cache';
import { verifyCsrf } from '~/server/csrf';
import { blockUser, respondToRequest, unblockUser, unmatch } from './connections';

export async function respondToConnectionRequest(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const requestId = String(formData.get('requestId') ?? '');
  const csrf = String(formData.get('__csrf') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!requestId || requestId.length > 64 || !['accept', 'decline'].includes(decision)) return;
  await respondToRequest(requestId, decision === 'accept', csrf);
  revalidatePath('/connections');
}

export async function unmatchConnection(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const matchId = String(formData.get('matchId') ?? '');
  const csrf = String(formData.get('__csrf') ?? '');
  if (!matchId || matchId.length > 64) return;
  await unmatch(matchId, csrf);
  revalidatePath('/connections');
}

export async function blockMember(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const userId = String(formData.get('userId') ?? '');
  const csrf = String(formData.get('__csrf') ?? '');
  if (!userId || userId.length > 64) return;
  await blockUser(userId, csrf);
  revalidatePath('/connections');
}

export async function unblockMember(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const userId = String(formData.get('userId') ?? '');
  const csrf = String(formData.get('__csrf') ?? '');
  if (!userId || userId.length > 64) return;
  await unblockUser(userId, csrf);
  revalidatePath('/connections');
}
