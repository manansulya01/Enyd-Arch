import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { StoriesFeed, type StoryItem } from '~/components/stories/stories-feed';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { db } from '~db';
import { blocks, stories, userFollows, users } from '~db/schema';

export const metadata: Metadata = {
  title: 'Stories',
  description: 'Short-lived updates shared by Enyd Arch members.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function StoriesPage() {
  const { actor } = await requireOnboarded();
  const [following, blockRows, csrfToken] = await Promise.all([
    db.select({ userId: userFollows.followedId }).from(userFollows)
      .where(eq(userFollows.followerId, actor.userId)).limit(500),
    db.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId }).from(blocks)
      .where(or(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, actor.userId))),
    sessionCsrfToken(),
  ]);

  const authorIds = [...new Set([actor.userId, ...following.map((row) => row.userId)])];
  const blockedIds = new Set(blockRows.map((row) =>
    row.blockerId === actor.userId ? row.blockedId : row.blockerId
  ));

  const rows = await db.select({
    id: stories.id,
    body: stories.body,
    audience: stories.audience,
    createdAt: stories.createdAt,
    expiresAt: stories.expiresAt,
    authorId: users.id,
    username: users.username,
    displayName: users.displayName,
  }).from(stories)
    .innerJoin(users, and(
      eq(users.id, stories.authorId),
      eq(users.status, 'active'),
      isNull(users.removedAt),
    ))
    .where(and(
      inArray(stories.authorId, authorIds),
      gt(stories.expiresAt, new Date()),
      isNull(stories.removedAt),
      or(
        eq(stories.audience, 'public'),
        eq(stories.authorId, actor.userId),
        eq(stories.audience, 'followers'),
      ),
    ))
    .orderBy(desc(stories.createdAt))
    .limit(60);

  const items: StoryItem[] = rows
    .filter((row) => row.authorId === actor.userId || !blockedIds.has(row.authorId))
    .map((row) => ({
      id: row.id,
      body: row.body,
      audience: row.audience,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      authorId: row.authorId,
      username: row.username,
      displayName: row.displayName,
      isMine: row.authorId === actor.userId,
    }));

  return (
    <PageShell
      title="Stories"
      sub="Small moments, shared with the people who follow you. Stories expire after 24 hours."
      actions={<Link className="btn btn-ghost btn-sm" href="/commons">Back to the Commons</Link>}
    >
      <div className="stack stack-4" style={{ maxWidth: 760 }}>
        <StoriesFeed stories={items} csrfToken={csrfToken} />
        <p className="t-small t-subtle">
          Stories are currently text-only. Public stories can be seen by signed-in members; follower stories are limited to members you follow. Blocking either way hides stories between those accounts.
        </p>
      </div>
    </PageShell>
  );
}
