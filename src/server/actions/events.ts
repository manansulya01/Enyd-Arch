'use server';

/** Events — gatherings: game nights, screenings, jams, study circles. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { eventComments, events, rsvps } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { slugify } from '~/lib/format';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { notify } from '~/server/notify';

const KINDS = new Set([
  'game_night', 'movie_night', 'competition', 'creative_challenge',
  'study_session', 'community', 'game_jam', 'archive_event',
]);

export async function createEvent(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const title = String(formData.get('title') ?? '').trim().slice(0, 180);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000);
  const kind = String(formData.get('kind') ?? 'community');
  const startsAtRaw = String(formData.get('startsAt') ?? '');
  const location = String(formData.get('location') ?? '').trim().slice(0, 200);
  const capacityRaw = Number(formData.get('capacity') ?? 0);

  if (title.length < 2) return fail('Give the event a title.', { title: ['Too short.'] });
  if (!KINDS.has(kind)) return fail('Choose an event kind.', { kind: ['Required.'] });

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    return fail('Pick a valid date and time.', { startsAt: ['Required.'] });
  }

  const base = slugify(title) || 'event';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const [taken] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(events)
    .values({
      slug,
      hostId: actor.userId,
      title,
      description,
      kind: kind as never,
      startsAt,
      location: location || null,
      capacity: capacityRaw > 0 ? Math.min(capacityRaw, 10_000) : null,
    })
    .returning({ slug: events.slug });

  revalidatePath('/events');
  return ok({ slug: created!.slug });
}

export async function rsvpToEvent(eventId: string, status: 'going' | 'interested' | 'declined', csrf: string): Promise<ActionResult> {
  const formData = new FormData();
  formData.set('__csrf', csrf);
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!['going', 'interested', 'declined'].includes(status)) return fail('Unknown RSVP.');

  const [event] = await db
    .select({ id: events.id, slug: events.slug, hostId: events.hostId, attendingCount: events.attendingCount, interestedCount: events.interestedCount, capacity: events.capacity })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.removedAt), isNull(events.cancelledAt)))
    .limit(1);
  if (!event) return fail('That event is not available.');

  const [existing] = await db
    .select({ status: rsvps.status })
    .from(rsvps)
    .where(and(eq(rsvps.eventId, eventId), eq(rsvps.userId, actor.userId)))
    .limit(1);

  if (status === 'going' && existing?.status !== 'going' && event.capacity !== null && event.attendingCount >= event.capacity) {
    return fail('This event has reached capacity.');
  }

  if (existing) {
    await db.update(rsvps).set({ status }).where(and(eq(rsvps.eventId, eventId), eq(rsvps.userId, actor.userId)));
    // Adjust counters: remove old, add new.
    const delta = (field: 'attendingCount' | 'interestedCount', oldOn: boolean, newOn: boolean) =>
      oldOn === newOn ? 0 : newOn ? 1 : -1;
    await db
      .update(events)
      .set({
        attendingCount: sql`greatest(0, ${events.attendingCount} + ${delta('attendingCount', existing.status === 'going', status === 'going')})`,
        interestedCount: sql`greatest(0, ${events.interestedCount} + ${delta('interestedCount', existing.status === 'interested', status === 'interested')})`,
      })
      .where(eq(events.id, eventId));
  } else {
    await db.insert(rsvps).values({ eventId, userId: actor.userId, status });
    await db
      .update(events)
      .set({
        attendingCount: sql`${events.attendingCount} + ${status === 'going' ? 1 : 0}`,
        interestedCount: sql`${events.interestedCount} + ${status === 'interested' ? 1 : 0}`,
      })
      .where(eq(events.id, eventId));
  }

  if (event.hostId !== actor.userId && status !== 'declined') {
    await notify({
      userId: event.hostId,
      kind: 'event_invite',
      title: `${actor.displayName} is ${status === 'going' ? 'coming' : 'interested'} in your event`,
      href: `/events/${event.slug}`,
      actorId: actor.userId,
    });
  }

  revalidatePath(`/events/${event.slug}`);
  revalidatePath('/events');
  return ok();
}

export async function commentOnEvent(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const eventId = String(formData.get('eventId') ?? '');
  const body = String(formData.get('body') ?? '').trim().slice(0, 2000);
  if (!eventId || !body) return fail('Write something first.');

  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return fail('That event is not available.');

  await db.insert(eventComments).values({ eventId, authorId: actor.userId, body });
  revalidatePath(`/events/${event.slug}`);
  return ok();
}
