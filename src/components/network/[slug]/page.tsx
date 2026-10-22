import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState } from '~/components/ui';
import { NetworkComments } from './network-comments';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { networkBySlug, networkComments } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { absoluteDate } from '~/lib/format';
import { sessionCsrfToken } from '~/server/csrf';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return { title: 'Network post' };
}

export default async function NetworkPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;

  const post = await networkBySlug(slug, actor.userId);
  if (!post) notFound();

  const [comments, csrfToken] = await Promise.all([
    networkComments(post.id, actor.userId),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title={post.title ?? ''} sub={`${post.author.displayName} · ${absoluteDate(post.createdAt)}`}>
      <div className="page-split">
        <div className="stack stack-5">
          <Link className="lnk" href="/network">
            ← Back to Network
          </Link>

          <article className="card card-pad-lg stack stack-4">
            <div className="row row-between">
              <span className="post-author">
                <Avatar
                  displayName={post.author.displayName}
                  avatarUrl={post.author.avatarUrl}
                  size="sm"
                />
                <span className="t-small">
                  by{' '}
                  <Link className="lnk" href={`/network/${post.author.username}`}>
                    {post.author.displayName}
                  </Link>{' '}
                  <span className="t-meta">@{post.author.username}</span>
                </span>
              </span>
              <span className="t-meta">{absoluteDate(post.createdAt)}</span>
            </div>

            {post.title && (
              <h1 className="mb-4">{post.title}</h1>
            )}

            <div className="prose prose-lg t-base">
              {post.content}
            </div>

            {post.hashtags.length > 0 && (
              <div className="shared-tags mt-6">
                {post.hashtags.map((tag) => (
                  <Link className="tag-link" href={`/network?tag=${encodeURIComponent(tag)}`} key={tag}>
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            <div className="row row-wrap mt-6">
              <ReactionBar
                csrfToken={csrfToken}
                targetType="post"
                targetId={post.id}
                myReactions={post.myReactions}
                count={post.reactionCount}
              />
            </div>
          </article>

          <NetworkComments postId={post.id} comments={comments} csrfToken={csrfToken} />
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">About this post</span>
            </div>
            <div className="panel-body stack stack-2">
              <p className="t-small t-subtle">
                Network posts are shared by members to connect and collaborate.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}