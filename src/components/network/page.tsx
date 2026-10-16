import type { Metadata } from 'next';
import Link from 'next/link';
import { NetworkComposer } from './composer';
import { CsrfField } from '~/components/shell/csrf-field';
import { NetworkCard } from './network-card';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { networkFeed, trendingTags } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Network' };

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; tag?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const sort = params.sort === 'recent' || params.sort === 'discussed' ? params.sort : 'active';
  const tag = params.tag ?? null;

  const [posts, tags] = await Promise.all([
    networkFeed({ viewerId: actor.userId, sort, topic: tag, limit: 25 }),
    trendingTags(12),
  ]);

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
          <NetworkComposer csrf={<CsrfField />} />

          <div className="row row-wrap row-between">
            <div className="btn-group" role="group" aria-label="Sort posts">
              {(['active', 'recent', 'discussed'] as const).map((option) => (
                <Link
                  key={option}
                  className={`btn btn-sm ${sort === option ? 'btn-primary' : 'btn-ghost'}`}
                  href={`/network?sort=${option}${tag ? `&tag=${tag}` : ''}`}
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
              title={tag ? `Nothing under #${tag} yet.` : 'The Network is quiet.'}
              body={
                tag
                  ? 'No posts carry this tag. You could be the first.'
                  : 'Be the first to say something. Share your projects, ideas, and questions here.'
              }
            />
          ) : (
            <div className="stack stack-4">
              {posts.map((post) => (
                <NetworkCard key={post.id} post={post} />
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