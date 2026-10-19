import type { Metadata } from 'next';
import Link from 'next/link';
import { NetworkComposer } from './composer';
import { NetworkCard } from './network-card';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { networkFeed, trendingTags } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { db } from '~db';
import { userFollows } from '~db/schema';
import { eq } from 'drizzle-orm';

export const metadata: Metadata = { title: 'Network' };

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; tag?: string; following?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const sort = params.sort === 'recent' || params.sort === 'discussed' ? params.sort : 'active';
  const tag = params.tag ?? null;
  const followingOnly = params.following === '1';

  const [posts, tags, csrfToken, followRows] = await Promise.all([
    networkFeed({ viewerId: actor.userId, sort, topic: tag, followingOnly, limit: 25 }),
    trendingTags(12),
    sessionCsrfToken(),
    db.select({ followedId: userFollows.followedId }).from(userFollows).where(eq(userFollows.followerId, actor.userId)),
  ]);
  const followedIds = new Set(followRows.map((row) => row.followedId));

  return (
    <PageShell
      title="Network"
      sub="Connect with fellow members."
      actions={
        <Link className="btn btn-ghost btn-sm" href="/search">
          Search
        </Link>
      }
    >
      <div className="page-split">
        <div className="stack stack-5">
          <NetworkComposer csrfToken={csrfToken} />

          <div className="row row-wrap row-between">
            <div className="btn-group" role="group" aria-label="Sort posts">
              <Link className={`btn btn-sm ${followingOnly ? 'btn-primary' : 'btn-ghost'}`} href={`/network?following=1`} aria-current={followingOnly ? 'true' : undefined}>Following</Link>
              <Link className={`btn btn-sm ${!followingOnly ? 'btn-primary' : 'btn-ghost'}`} href="/network" aria-current={!followingOnly ? 'true' : undefined}>Everyone</Link>
              {(['active', 'recent', 'discussed'] as const).map((option) => (
                <Link
                  key={option}
                  className={`btn btn-sm ${sort === option ? 'btn-primary' : 'btn-ghost'}`}
                  href={`/network?sort=${option}${tag ? `&tag=${tag}` : ''}${followingOnly ? '&following=1' : ''}`}
                  aria-current={sort === option ? 'true' : undefined}
                >
                  {option === 'active' ? 'Active' : option === 'recent' ? 'New' : 'Most discussed'}
                </Link>
              ))}
            </div>
            {tag && (
              <Link className="badge badge-accent" href="/network">
                #{tag} ×
              </Link>
            )}
          </div>

          {posts.length === 0 ? (
            <EmptyState
              glyph="❝"
              title={tag ? `Nothing under #${tag} yet.` : followingOnly ? 'No posts from people you follow yet.' : 'The Network is quiet.'}
              body={
                tag
                  ? 'No posts carry this tag. You could be the first.'
                  : followingOnly ? 'Follow members from their posts to build a personal, chronological feed.' : 'Be the first to say something. Share your projects, ideas, and questions here.'
              }
            />
          ) : (
            <div className="stack stack-4">
              {posts.map((post) => (
                <NetworkCard key={post.id} post={post} viewerId={actor.userId} csrfToken={csrfToken} isFollowing={followedIds.has(post.author.userId)} />
              ))}
            </div>
          )}
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Tags in circulation</span>
            </div>
            <div className="panel-body stack stack-2">
              {tags.length === 0 ? (
                <p className="t-small t-subtle">No tags yet.</p>
              ) : (
                tags.map((entry) => (
                  <Link className="row row-between" href={`/network?tag=${entry.tag}`} key={entry.tag}>
                    <span className="tag-link">#{entry.tag}</span>
                    <span className="t-meta">{entry.useCount}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="t-label">How this works</span>
            </div>
            <div className="panel-body stack stack-2">
              <p className="t-small t-subtle">
                Posts are ordered by activity, not by advertising. Nothing here is boosted and
                nothing expires into oblivion — every post keeps its replies.
              </p>
              <p className="t-small t-subtle">
                Use <span className="mono">#tag</span> to file a post and{' '}
                <span className="mono">@handle</span> to bring a member in.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}