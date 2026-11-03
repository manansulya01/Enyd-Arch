import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { achievements, userAchievements } from '~db/schema';

export const metadata: Metadata = { title: 'The Registry' };

export default async function RegistryPage() {
  const { actor } = await requireOnboarded();
  const entries = await db.select({
    id: achievements.id,
    key: achievements.key,
    label: achievements.label,
    description: achievements.description,
    glyph: achievements.glyph,
    unlockedAt: userAchievements.unlockedAt,
  })
    .from(achievements)
    .leftJoin(userAchievements, and(
      eq(userAchievements.achievementId, achievements.id),
      eq(userAchievements.userId, actor.userId),
    ))
    .where(eq(achievements.hidden, false))
    .orderBy(asc(achievements.label));

  return (
    <PageShell title="The Registry" sub="Standing, milestones and the marks members earn over time.">
      {entries.length === 0 ? (
        <EmptyState glyph="❒" title="The Registry is being written." body="Achievements and milestones will appear here as members unlock them." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <Link className="card card-pad-md stack stack-2" href={`/registry/${entry.key}`} key={entry.id}>
              <div className="row row-between">
                <span className="t-section" aria-hidden="true">{entry.glyph}</span>
                <span className={entry.unlockedAt ? 'badge badge-accent' : 'badge badge-plain'}>{entry.unlockedAt ? 'Earned' : 'Not yet earned'}</span>
              </div>
              <strong>{entry.label}</strong>
              <p className="t-small t-subtle">{entry.description}</p>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
