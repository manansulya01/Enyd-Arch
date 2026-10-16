import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { db } from '~db';
import { chronicleEntries, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
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
    author: users.username,
  }).from(chronicleEntries)
    .leftJoin(users, eq(users.id, chronicleEntries.authorId))
    .where(eq(chronicleEntries.kind, 'public'))
    .orderBy(asc(chronicleEntries.occurredOn))
    .limit(200);

  return (
    <PageShell title="The Chronicle" sub="The public history of the Arch, preserved by its members." wide>
      {entries.length === 0 ? (
        <EmptyState glyph="✦" title="The Chronicle has not begun." body="Public historical entries will appear here when they are curated." />
      ) : (
        <div className="timeline">
          {entries.map((entry) => (
            <article className="timeline-entry panel panel-body stack stack-2" key={entry.id}>
              <div className="row row-between row-wrap">
                <span className="badge">{entry.era}</span>
                <time className="t-meta" dateTime={entry.occurredOn.toISOString()}>{entry.occurredOn.toLocaleDateString()}</time>
              </div>
              <h2 className="t-heading">{entry.headline}</h2>
              <p className="t-body">{entry.body}</p>
              {entry.author && <p className="t-meta">Recorded by @{entry.author}</p>}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
