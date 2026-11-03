'use server';

import { revalidatePath } from 'next/cache';
import { verifyCsrf } from '~/server/csrf';
import { blockUser, respondToRequest, unblockUser, unmatch } from './connections';

export async function respondToConnectionRequest(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!requestId || requestId.length > 64 || !['accept', 'decline'].includes(decision)) return;
  await respondToRequest(requestId, decision === 'accept');
  revalidatePath('/connections');
}

export async function unmatchConnection(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const matchId = String(formData.get('matchId') ?? '');
  if (!matchId || matchId.length > 64) return;
  await unmatch(matchId);
  revalidatePath('/connections');
}

export async function blockMember(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const userId = String(formData.get('userId') ?? '');
  if (!userId || userId.length > 64) return;
  await blockUser(userId);
  revalidatePath('/connections');
}

export async function unblockMember(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const userId = String(formData.get('userId') ?? '');
  if (!userId || userId.length > 64) return;
  await unblockUser(userId);
  revalidatePath('/connections');
}
