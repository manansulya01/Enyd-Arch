import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostCard } from '~/components/commons/post-card';
import { Comments } from '~/components/commons/comments';
import { PageShell } from '~/components/ui/page-shell';
import { feed, postById, postComments, trendingTopics } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: 'Conversation' };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOnboarded();
  const { id } = await params;

  const [post, comments, topics] = await Promise.all([
    postById(id, actor.userId),
    postComments(id, actor.userId),
    trendingTopics(10),
  ]);

  if (!post) notFound();

  const related = (await feed({ viewerId: actor.userId, limit: 6 })).filter(
    (entry) => entry.id !== post.id,
  );

  return (
    <PageShell title="Conversation" sub={`@${post.author.username} · ${post.author.memberId}`}>
      <div className="page-split">
        <div className="stack stack-5">
          <Link className="lnk" href="/commons">
            ← Back to the Commons
          </Link>
          <PostCard post={post} detail />
          <Comments postId={post.id} comments={comments} />
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Elsewhere in the Commons</span>
            </div>
            <div className="panel-body stack stack-2">
              {related.length === 0 ? (
                <p className="t-small t-subtle">Nothing else right now.</p>
              ) : (
                related.map((entry) => (
                  <Link className="t-small" href={`/commons/${entry.id}`} key={entry.id}>
                    {entry.author.displayName} ·{' '}
                    {entry.body ? entry.body.slice(0, 70) : entry.hashtags.map((t) => `#${t}`).join(' ')}
                  </Link>
                ))
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Topics</span>
            </div>
            <div className="panel-body row row-wrap">
              {topics.map((entry) => (
                <Link className="tag-link" href={`/commons?topic=${entry.tag}`} key={entry.tag}>
                  #{entry.tag}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
