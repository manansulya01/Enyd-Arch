import type { Metadata } from 'next';
import Link from 'next/link';
import { Composer } from '~/components/commons/composer';
import { PostCard } from '~/components/commons/post-card';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { feed, trendingTopics } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'The Commons' };

export default async function CommonsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; topic?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const sort = params.sort === 'recent' || params.sort === 'discussed' ? params.sort : 'active';
  const topic = params.topic ?? null;

  const [posts, topics, csrfToken] = await Promise.all([
    feed({ viewerId: actor.userId, sort, topic, limit: 25 }),
    trendingTopics(12),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell
      title="The Commons"
      sub="Conversation, without an algorithm in the way."
      actions={
        <Link className="btn btn-ghost btn-sm" href="/search">
          Search
        </Link>
      }
    >
      <div className="page-split">
        <div className="stack stack-5">
          <Composer csrfToken={csrfToken} />

          <div className="row row-wrap row-between">
            <div className="btn-group" role="group" aria-label="Sort posts">
              {(['active', 'recent', 'discussed'] as const).map((option) => (
                <Link
                  key={option}
                  className={`btn btn-sm ${sort === option ? 'btn-primary' : 'btn-ghost'}`}
                  href={`/commons?sort=${option}${topic ? `&topic=${topic}` : ''}`}
                  aria-current={sort === option ? 'true' : undefined}
                >
                  {option === 'active' ? 'Active' : option === 'recent' ? 'New' : 'Most discussed'}
                </Link>
              ))}
            </div>
            {topic && (
              <Link className="badge badge-accent" href="/commons">
                #{topic} ×
              </Link>
            )}
          </div>

          {posts.length === 0 ? (
            <EmptyState
              glyph="❝"
              title={topic ? `Nothing under #${topic} yet.` : 'The Commons is quiet.'}
              body={
                topic
                  ? 'No posts carry this topic. You could be the first.'
                  : 'Be the first to say something. Questions, half-finished work, and recommendations all belong here.'
              }
            />
          ) : (
            <div className="stack stack-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Topics in circulation</span>
            </div>
            <div className="panel-body stack stack-2">
              {topics.length === 0 ? (
                <p className="t-small t-subtle">No topics yet.</p>
              ) : (
                topics.map((entry) => (
                  <Link className="row row-between" href={`/commons?topic=${entry.tag}`} key={entry.tag}>
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
                Use <span className="mono">#topic</span> to file a post and{' '}
                <span className="mono">@handle</span> to bring a member in.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
