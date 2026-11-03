import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { achievements, userAchievements } from '~db/schema';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'Registry entry' };

export default async function RegistryEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [entry] = await db.select({
    id: achievements.id,
    key: achievements.key,
    label: achievements.label,
    description: achievements.description,
    glyph: achievements.glyph,
    hidden: achievements.hidden,
    unlockedAt: userAchievements.unlockedAt,
  })
    .from(achievements)
    .leftJoin(userAchievements, and(
      eq(userAchievements.achievementId, achievements.id),
      eq(userAchievements.userId, actor.userId),
    ))
    .where(eq(achievements.key, slug))
    .limit(1);

  if (!entry || (entry.hidden && !entry.unlockedAt)) notFound();

  return (
    <PageShell title={entry.label} sub="The Registry">
      <div className="card card-pad-lg stack stack-3">
        <span className="t-section" aria-hidden="true">{entry.glyph}</span>
        <p>{entry.description}</p>
        {entry.unlockedAt ? (
          <p className="t-meta">Earned {relativeTime(entry.unlockedAt)}</p>
        ) : (
          <p className="t-meta">Not yet earned</p>
        )}
        <Link className="lnk" href="/registry">← Back to Registry</Link>
      </div>
    </PageShell>
  );
}
