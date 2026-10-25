import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EventComposer } from '~/components/events/event-composer';
import { requireOnboarded } from '~/server/guard';
import { events } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  const { actor } = await requireOnboarded();
  const [upcoming, csrfToken] = await Promise.all([
    events({ viewerId: actor.userId, limit: 40 }),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="Events" sub="Gatherings, study circles, game nights, and screenings." wide>
      <EventComposer csrfToken={csrfToken} />
      <section className="stack stack-3">
        <h2 className="section-heading">Coming up</h2>
        {upcoming.length === 0 ? (
          <div className="panel panel-body"><h3>No upcoming events</h3><p className="t-small t-muted">Create a gathering and give the community a reason to meet.</p></div>
        ) : upcoming.map((event) => (
          <article className="panel panel-body" key={event.id}>
            <div className="row row-3">
              {event.coverUrl && <img src={event.coverUrl} alt="" width={88} height={88} className="event-cover" />}
              <div className="grow">
                <p className="t-meta">{event.kind.replaceAll('_', ' ')} · {event.startsAt.toLocaleString()}</p>
                <h3><Link href={'/events/' + event.slug}>{event.title}</Link></h3>
                <p className="t-small t-muted">{event.description}</p>
                <p className="t-meta">{event.host.displayName} · {event.attendingCount} going{event.capacity ? ' · capacity ' + event.capacity : ''}</p>
              </div>
              <Link className="btn btn-secondary" href={'/events/' + event.slug}>Details</Link>
            </div>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
