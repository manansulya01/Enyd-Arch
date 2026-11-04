'use server';

import { revalidatePath } from 'next/cache';
import { verifyCsrf } from '~/server/csrf';
import { rsvpToEvent } from './events';

export async function setEventRsvp(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const eventId = String(formData.get('eventId') ?? '');
  const csrf = String(formData.get('__csrf') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!eventId || eventId.length > 64 || !['going', 'interested', 'declined'].includes(status)) return;
  await rsvpToEvent(eventId, status as 'going' | 'interested' | 'declined', csrf);
  revalidatePath('/events');
}
