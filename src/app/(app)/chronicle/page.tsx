import type { Metadata } from 'next';
import { desc, eq, sql } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { achievements, userAchievements, users, userSettings } from '~db/schema';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'The Chronicle' };

export default async function ChroniclePage() {
  await requireOnboarded();
  const entries = await db.select({
    label: achievements.label,
    glyph: achievements.glyph,
    username: users.username,
    displayName: users.displayName,
    unlockedAt: userAchievements.unlockedAt,
  })
    .from(userAchievements)
    .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
    .innerJoin(users, eq(users.id, userAchievements.userId))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(sql`${achievements.hidden} = false and coalesce(${userSettings.showActivity}, true) = true and ${users.status} = 'active'`)
    .orderBy(desc(userAchievements.unlockedAt))
    .limit(80);

  return (
    <PageShell title="The Chronicle" sub="A living record of the milestones members choose to share.">
      {entries.length === 0 ? (
        <EmptyState glyph="✦" title="The pages are quiet." body="Shared milestones will appear here as members earn them." />
      ) : (
        <div className="stack stack-2">
          {entries.map((entry, index) => (
            <article className="card card-pad-md row row-between" key={`${entry.username}-${entry.label}-${index}`}>
              <div className="row row-3">
                <span className="t-section" aria-hidden="true">{entry.glyph}</span>
                <div className="stack stack-1">
                  <strong>{entry.displayName} earned {entry.label}</strong>
                  <span className="t-meta">@{entry.username}</span>
                </div>
              </div>
              <time className="t-meta" dateTime={entry.unlockedAt.toISOString()}>{relativeTime(entry.unlockedAt)}</time>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
