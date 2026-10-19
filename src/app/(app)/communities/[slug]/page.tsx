import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '~db';
import { blocks, communities, communityMembers, communityPosts, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { CommunityPostForm } from '~/components/communities/community-post-form';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Community' };

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [community] = await db.select().from(communities)
    .where(and(eq(communities.slug, slug), eq(communities.isPrivate, false))).limit(1);
  if (!community) notFound();

  const [membership, rows, blockRows, csrfToken] = await Promise.all([
    db.select().from(communityMembers).where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, actor.userId))).limit(1),
    db.select({ id: communityPosts.id, title: communityPosts.title, body: communityPosts.body, createdAt: communityPosts.createdAt, authorId: users.id, username: users.username, displayName: users.displayName })
      .from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorId))
      .where(and(eq(communityPosts.communityId, community.id), eq(communityPosts.status, 'published'), isNull(communityPosts.removedAt), eq(users.status, 'active'), isNull(users.removedAt)))
      .orderBy(desc(communityPosts.createdAt)).limit(100),
    db.select().from(blocks).where(or(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, actor.userId))),
    sessionCsrfToken(),
  ]);
  const hidden = new Set(blockRows.map(row => row.blockerId === actor.userId ? row.blockedId : row.blockerId));
  const posts = rows.filter(post => !hidden.has(post.authorId));
  const joined = membership.length > 0;
  return <PageShell title={community.name} sub={community.description || 'Public community'} actions={<Link className="btn btn-ghost btn-sm" href="/communities">All communities</Link>}>
    <div className="stack stack-4">
      <p className="t-small">{posts.length} discussions · {community.name}</p>
      {!joined && <p className="t-small t-muted">Join this community from the directory before posting.</p>}
      {joined && <CommunityPostForm communityId={community.id} csrfToken={csrfToken} />}
      {posts.length === 0 ? <EmptyState glyph="▦" title="No discussions yet" body="Start a discussion to give this community its first thread." /> :
        <div className="stack stack-3">{posts.map(post => <article className="panel panel-body stack stack-2" key={post.id}>
          {post.title && <h2>{post.title}</h2>}
          <p className="t-meta">by {post.displayName} (@{post.username}) · {post.createdAt.toLocaleDateString()}</p>
          <p className="prose">{post.body}</p>
        </article>)}</div>}
    </div>
  </PageShell>;
}