import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { events } from '~/server/queries';
import { absoluteDate } from '~/lib/format';
import { sessionCsrfToken } from '~/server/csrf';
import { setEventRsvp } from '~/server/actions/events-client';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  const { actor } = await requireOnboarded();
  const [upcoming, csrf] = await Promise.all([
    events({ viewerId: actor.userId, limit: 36 }),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="Events" sub="Gatherings, study sessions, game nights and creative challenges.">
      {upcoming.length === 0 ? (
        <EmptyState glyph="✧" title="No upcoming gatherings." body="When members schedule a gathering, it will appear here." />
      ) : (
        <div className="stack stack-3">
          {upcoming.map((event) => (
            <article className="card card-pad-md stack stack-2" key={event.id}>
              <div className="row row-between">
                <span className="t-meta">{event.kind.replaceAll('_', ' ')}</span>
                <time className="t-meta" dateTime={event.startsAt.toISOString()}>{absoluteDate(event.startsAt)}</time>
              </div>
              <h2 className="t-section">{event.title}</h2>
              <p className="t-small t-subtle">{event.description}</p>
              <div className="row row-wrap t-meta">
                <span>Hosted by {event.host.displayName}</span>
                {event.location && <span>· {event.location}</span>}
                <span>· {event.attendingCount} going</span>
                <span>· {event.interestedCount} interested</span>
              </div>
<div className="row row-2"><form action={setEventRsvp}><input type="hidden" name="__csrf" value={csrf} /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="status" value="going" /><button className="btn btn-sm btn-primary" type="submit">{event.myRsvp === 'going' ? 'Going ✓' : 'I’m going'}</button></form><form action={setEventRsvp}><input type="hidden" name="__csrf" value={csrf} /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="status" value="interested" /><button className="btn btn-sm btn-ghost" type="submit">{event.myRsvp === 'interested' ? 'Interested ✓' : 'Interested'}</button></form></div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
