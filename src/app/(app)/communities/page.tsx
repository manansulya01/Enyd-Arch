import type { Metadata } from 'next';
import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '~db';
import { communities, communityMembers } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { CommunityDirectory } from '~/components/communities/community-directory';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Communities' };

export default async function CommunitiesPage() {
  const { actor } = await requireOnboarded();
  const [rows, memberships, csrfToken] = await Promise.all([
    db.select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      memberCount: sql<number>`count(${communityMembers.userId})::int`,
    }).from(communities)
      .leftJoin(communityMembers, eq(communityMembers.communityId, communities.id))
      .groupBy(communities.id)
      .orderBy(desc(communities.createdAt)).limit(60),
    db.select({ communityId: communityMembers.communityId }).from(communityMembers)
      .where(eq(communityMembers.userId, actor.userId)),
    sessionCsrfToken(),
  ]);
  return <PageShell title="Communities" sub="Public spaces for shared interests, questions, and projects." wide>
    <CommunityDirectory communities={rows} joinedIds={memberships.map(row => row.communityId)} csrfToken={csrfToken} />
  </PageShell>;
}
