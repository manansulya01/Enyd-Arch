'use server';

import { revalidatePath } from 'next/cache';
import { verifyCsrf } from '~/server/csrf';
import { respondToRequest, unmatch } from './connections';

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
