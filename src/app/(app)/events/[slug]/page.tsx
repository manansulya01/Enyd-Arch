import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { EventRsvpButtons } from '~/components/events/event-forms';
import { events } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Event' };

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [upcoming, past] = await Promise.all([
    events({ viewerId: actor.userId, limit: 40 }),
    events({ viewerId: actor.userId, past: true, limit: 40 }),
  ]);
  const event = [...upcoming, ...past].find((item) => item.slug === slug);
  if (!event) notFound();

  return (
    <PageShell title={event.title} sub={`${event.kind.replaceAll('_', ' ')} · hosted by @${event.host.username}`} actions={<Link className="btn btn-ghost btn-sm" href="/events">All events</Link>}>
      <article className="panel panel-body stack stack-4">
        <p className="t-body">{event.description || 'No description has been added.'}</p>
        <dl className="stack stack-2">
          <div><dt className="t-label">Starts</dt><dd>{event.startsAt.toLocaleString()}</dd></div>
          {event.location && <div><dt className="t-label">Location</dt><dd>{event.location}</dd></div>}
          {event.capacity && <div><dt className="t-label">Capacity</dt><dd>{event.capacity}</dd></div>}
          <div><dt className="t-label">Attendance</dt><dd>{event.attendingCount} going · {event.interestedCount} interested</dd></div>
        </dl>
        <EventRsvpButtons eventId={event.id} current={event.myRsvp} />
      </article>
    </PageShell>
  );
}
