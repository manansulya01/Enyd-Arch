import type { Metadata } from 'next';
import { desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '~db';
import { communities, communityMembers } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { CommunityDirectory } from '~/components/communities/community-directory';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Communities' };

export default async function CommunitiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const [rows, memberships, csrfToken] = await Promise.all([
    db.select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      memberCount: sql<number>`count(${communityMembers.userId})::int`,
    }).from(communities)
      .leftJoin(communityMembers, eq(communityMembers.communityId, communities.id))
      .where(or(eq(communities.isPrivate, false), eq(communities.ownerId, actor.userId), inArray(communities.id, db.select({ communityId: communityMembers.communityId }).from(communityMembers).where(eq(communityMembers.userId, actor.userId)))))
      .groupBy(communities.id)
      .orderBy(desc(communities.createdAt)).limit(60),
    db.select({ communityId: communityMembers.communityId }).from(communityMembers)
      .where(eq(communityMembers.userId, actor.userId)),
    sessionCsrfToken(),
  ]);
  return <PageShell title="Communities" sub="Public spaces for shared interests, questions, and projects." wide>
    {params.error && <p className="notice notice-danger" role="alert">
      {params.error === 'slow-down'
        ? 'Please wait before trying that community change again.'
        : params.error === 'transfer-not-allowed'
          ? 'Ownership can only be transferred by the current owner to an active member.'
          : params.error === 'invalid-transfer'
            ? 'Confirm the ownership transfer and choose an eligible member.'
            : 'That community change could not be completed.'}
    </p>}
    <CommunityDirectory communities={rows} joinedIds={memberships.map(row => row.communityId)} csrfToken={csrfToken} />
  </PageShell>;
}
