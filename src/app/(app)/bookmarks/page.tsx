import type { Metadata } from 'next';
import Link from 'next/link';
import { PostCard } from '~/components/commons/post-card';
import { BookmarkButton } from '~/components/commons/bookmark-button';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { feed, savedNonPostItems } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = {
  title: 'Saved items',
  description: 'Your private collection of saved posts, Archive objects, games, and Gallery pieces.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function SavedPostsPage() {
  const { actor } = await requireOnboarded();
  const [posts, otherItems, csrfToken] = await Promise.all([
    feed({ viewerId: actor.userId, bookmarkedOnly: true, limit: 40 }),
    savedNonPostItems(actor.userId),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell
      title="Saved items"
      sub="A private shelf for posts, Archive objects, approved games, and Gallery pieces. Only you can see this list."
      actions={<Link className="btn btn-ghost btn-sm" href="/commons">The Commons</Link>}
    >
      {posts.length === 0 && otherItems.length === 0 ? (
        <EmptyState
          glyph="☆"
          title="Nothing saved yet."
          body="Use Save on a post to keep it here for later. Your saved list is private."
        />
      ) : (
        <div className="stack stack-5">
          {posts.length > 0 && (
            <section className="stack stack-3">
              <h2 className="section-heading">Posts</h2>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} csrfToken={csrfToken} />
              ))}
            </section>
          )}
          {otherItems.length > 0 && (
            <section className="stack stack-3">
              <h2 className="section-heading">Other saved items</h2>
              {otherItems.map((item) => (
                <article className="panel panel-body row row-between row-wrap" key={`${item.targetType}:${item.targetId}`}>
                  <div className="stack stack-1">
                    <span className="t-meta">{item.targetType.replace('_', ' ')}</span>
                    <Link className="lnk" href={item.href}>{item.title}</Link>
                  </div>
                  <BookmarkButton
                    targetType={item.targetType}
                    targetId={item.targetId}
                    csrfToken={csrfToken}
                    initialSaved
                  />
                </article>
              ))}
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
