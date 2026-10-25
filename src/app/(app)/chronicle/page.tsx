import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { db } from '~db';
import { chronicleEntries } from '~db/schema';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'The Chronicle' };

export default async function ChroniclePage() {
  await requireOnboarded();
  const entries = await db.select({
    id: chronicleEntries.id,
    era: chronicleEntries.era,
    headline: chronicleEntries.headline,
    body: chronicleEntries.body,
    occurredOn: chronicleEntries.occurredOn,
    relatedEventId: chronicleEntries.relatedEventId,
    relatedObjectId: chronicleEntries.relatedObjectId,
  }).from(chronicleEntries)
    .where(eq(chronicleEntries.kind, 'public'))
    .orderBy(desc(chronicleEntries.occurredOn))
    .limit(100);

  return (
    <PageShell title="The Chronicle" sub="A living record of the society’s public milestones." wide>
      {entries.length === 0 ? (
        <div className="panel panel-body"><h2>The first page is still unwritten</h2><p className="t-small t-muted">Public milestones will appear here as the society grows.</p></div>
      ) : (
        <ol className="chronicle-timeline stack stack-3">
          {entries.map((entry) => (
            <li key={entry.id} className="panel panel-body stack stack-2">
              <p className="t-meta">{entry.era} · {entry.occurredOn.toLocaleDateString()}</p>
              <h2>{entry.headline}</h2>
              <p className="prose-content">{entry.body}</p>
              {(entry.relatedEventId || entry.relatedObjectId) && (
                <div className="row row-3">
                  {entry.relatedEventId && <Link className="btn btn-ghost btn-sm" href="/events">Related event</Link>}
                  {entry.relatedObjectId && <Link className="btn btn-ghost btn-sm" href="/archive">Related archive item</Link>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}
