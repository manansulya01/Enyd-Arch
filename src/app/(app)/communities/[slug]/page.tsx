import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '~db';
import { blocks, communities, communityMembers, communityPostComments, communityPostVotes, communityPosts, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { CommunityPostForm } from '~/components/communities/community-post-form';
import { CommunityComments } from '~/components/communities/community-comments';
import { CommunityPostVoting } from '~/components/communities/community-post-voting';
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
  const commentRows = rows.length === 0 ? [] : await db.select({
    id: communityPostComments.id,
    postId: communityPostComments.postId,
    body: communityPostComments.body,
    createdAt: communityPostComments.createdAt,
    authorId: users.id,
    username: users.username,
    displayName: users.displayName,
  })
    .from(communityPostComments)
    .innerJoin(users, eq(users.id, communityPostComments.authorId))
    .where(and(
      inArray(communityPostComments.postId, rows.map(post => post.id)),
      eq(communityPostComments.status, 'published'),
      isNull(communityPostComments.removedAt),
      eq(users.status, 'active'),
      isNull(users.removedAt),
    ))
    .orderBy(communityPostComments.createdAt)
    .limit(500);
  const commentsByPost = new Map<string, typeof commentRows>();
  for (const comment of commentRows) {
    if (hidden.has(comment.authorId)) continue;
    const list = commentsByPost.get(comment.postId) ?? [];
    list.push(comment);
    commentsByPost.set(comment.postId, list);
  }
  const voteRows = rows.length === 0 ? [] : await db.select({
    postId: communityPostVotes.postId,
    userId: communityPostVotes.userId,
    value: communityPostVotes.value,
  })
    .from(communityPostVotes)
    .where(inArray(communityPostVotes.postId, rows.map(post => post.id)));
  const voteSummaryByPost = new Map<string, { upvotes: number; downvotes: number; currentVote: -1 | 0 | 1 }>();
  for (const vote of voteRows) {
    const summary = voteSummaryByPost.get(vote.postId) ?? { upvotes: 0, downvotes: 0, currentVote: 0 as const };
    if (vote.value === 1) summary.upvotes += 1;
    if (vote.value === -1) summary.downvotes += 1;
    if (vote.userId === actor.userId) summary.currentVote = vote.value === 1 ? 1 : -1;
    voteSummaryByPost.set(vote.postId, summary);
  }
  const canModerate = membership[0]?.role === 'owner' || membership[0]?.role === 'moderator';
  return <PageShell title={community.name} sub={community.description || 'Public community'} actions={<Link className="btn btn-ghost btn-sm" href="/communities">All communities</Link>}>
    <div className="stack stack-4">
      <p className="t-small">{posts.length} discussions · {community.name}</p>
      {!joined && <p className="t-small t-muted">Join this community from the directory before posting.</p>}
      {joined && <CommunityPostForm communityId={community.id} csrfToken={csrfToken} />}
      {posts.length === 0 ? <EmptyState glyph="▦" title="No discussions yet" body="Start a discussion to give this community its first thread." /> :
        <div className="stack stack-3">{posts.map(post => <article className="panel panel-body stack stack-2" key={post.id}>
          {post.title && <h2>{post.title}</h2>}
          <p className="t-meta">by {post.displayName} (@{post.username}) · {post.createdAt.toLocaleDateString()}</p>
          <CommunityPostVoting
            postId={post.id}
            upvotes={voteSummaryByPost.get(post.id)?.upvotes ?? 0}
            downvotes={voteSummaryByPost.get(post.id)?.downvotes ?? 0}
            currentVote={voteSummaryByPost.get(post.id)?.currentVote ?? 0}
            joined={joined}
            csrfToken={csrfToken}
          />
          <p className="prose">{post.body}</p>
          <CommunityComments
            postId={post.id}
            comments={(commentsByPost.get(post.id) ?? []).map(comment => ({
              id: comment.id,
              body: comment.body,
              authorId: comment.authorId,
              username: comment.username,
              displayName: comment.displayName,
              createdAt: comment.createdAt.toISOString(),
            }))}
            csrfToken={csrfToken}
            viewerId={actor.userId}
            joined={joined}
            canModerate={canModerate}
          />
        </article>)}</div>}
    </div>
  </PageShell>;
}