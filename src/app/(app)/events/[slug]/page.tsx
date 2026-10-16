import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { RSVPButtons } from '~/components/events/rsvp-buttons';
import { requireOnboarded } from '~/server/guard';
import { events } from '~/server/queries';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { actor } = await requireOnboarded();
  const all = await Promise.all([events({ viewerId: actor.userId, limit: 40 }), events({ viewerId: actor.userId, limit: 40, past: true })]);
  const event = all.flat().find((item) => item.slug === slug);
  return event ? { title: event.title, description: event.description } : { title: 'Event not found' };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const all = await Promise.all([events({ viewerId: actor.userId, limit: 40 }), events({ viewerId: actor.userId, limit: 40, past: true })]);
  const event = all.flat().find((item) => item.slug === slug);
  if (!event) notFound();

  return (
    <PageShell title={event.title} sub={event.kind.replaceAll('_', ' ')} wide>
      <article className="panel panel-body stack-3">
        {event.coverUrl && <img src={event.coverUrl} alt="" className="event-hero" />}
        <p>{event.description}</p>
        <dl className="stack stack-2">
          <div><dt className="t-label">Starts</dt><dd>{event.startsAt.toLocaleString()}</dd></div>
          {event.endsAt && <div><dt className="t-label">Ends</dt><dd>{event.endsAt.toLocaleString()}</dd></div>}
          {event.location && <div><dt className="t-label">Location</dt><dd>{event.location}</dd></div>}
          <div><dt className="t-label">Host</dt><dd>{event.host.displayName}</dd></div>
          <div><dt className="t-label">Attendance</dt><dd>{event.attendingCount} going · {event.interestedCount} interested</dd></div>
        </dl>
        <RSVPButtons eventId={event.id} current={event.myRsvp} />
        <Link className="btn btn-ghost" href="/events">Back to Events</Link>
      </article>
    </PageShell>
  );
}
