import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { events } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  const { actor } = await requireOnboarded();
  const upcoming = await events({ viewerId: actor.userId, limit: 40 });

  return (
    <PageShell title="Events" sub="Gatherings, screenings, jams, and study circles." wide actions={<Link className="btn btn-primary btn-sm" href="/events/new">Create event</Link>}>
      {upcoming.length === 0 ? (
        <EmptyState glyph="✧" title="Nothing scheduled yet." body="Create a small gathering and invite the community." action={<Link className="btn btn-primary" href="/events/new">Create an event</Link>} />
      ) : (
        <div className="archive-grid">
          {upcoming.map((event) => (
            <Link key={event.id} href={`/events/${event.slug}`} className="card card-pad card-interactive stack stack-2">
              <span className="badge">{event.kind.replaceAll('_', ' ')}</span>
              <h2 className="t-heading">{event.title}</h2>
              <p className="t-small t-subtle">{event.description || 'A gathering for members.'}</p>
              <p className="t-meta">{event.startsAt.toLocaleString()} · host @{event.host.username}</p>
              <p className="t-meta">{event.attendingCount} going · {event.interestedCount} interested{event.capacity ? ` · capacity ${event.capacity}` : ''}</p>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
