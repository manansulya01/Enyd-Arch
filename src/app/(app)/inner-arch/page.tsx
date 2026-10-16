import type { Metadata } from 'next';
import { and, asc, eq, or, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '~db';
import { chronicleEntries } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = {
  title: 'The Inner Arch',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function InnerArchPage() {
  const { actor } = await requireOnboarded();
  if (!actor.capabilities.includes('inner_arch')) redirect('/home');

  const entries = await db.select({
    id: chronicleEntries.id,
    era: chronicleEntries.era,
    headline: chronicleEntries.headline,
    body: chronicleEntries.body,
    occurredOn: chronicleEntries.occurredOn,
    unlockHint: chronicleEntries.unlockHint,
  }).from(chronicleEntries)
    .where(and(
      eq(chronicleEntries.kind, 'hidden'),
      or(isNull(chronicleEntries.unlockLevel), eq(chronicleEntries.unlockLevel, actor.level)),
    ))
    .orderBy(asc(chronicleEntries.occurredOn))
    .limit(100);

  return (
    <PageShell title="The Inner Arch" sub="A quieter layer for members who have earned access." wide>
      {entries.length === 0 ? (
        <EmptyState glyph="✦" title="Nothing has been revealed yet." body="Hidden Chronicle entries appear here only when your access level allows it." />
      ) : (
        <div className="timeline">
          {entries.map((entry) => (
            <article className="timeline-entry panel panel-body stack stack-2" key={entry.id}>
              <div className="row row-between row-wrap">
                <span className="badge">Hidden · {entry.era}</span>
                <time className="t-meta" dateTime={entry.occurredOn.toISOString()}>{entry.occurredOn.toLocaleDateString()}</time>
              </div>
              <h2 className="t-heading">{entry.headline}</h2>
              <p className="t-body">{entry.body}</p>
              {entry.unlockHint && <p className="t-meta">Hint: {entry.unlockHint}</p>}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
