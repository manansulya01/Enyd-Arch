import type { Metadata } from 'next';
import Link from 'next/link';
import { PostCard } from '~/components/commons/post-card';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { feed } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = {
  title: 'Saved posts',
  description: 'Your private collection of saved Commons and Network posts.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function SavedPostsPage() {
  const { actor } = await requireOnboarded();
  const [posts, csrfToken] = await Promise.all([
    feed({ viewerId: actor.userId, bookmarkedOnly: true, limit: 40 }),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell
      title="Saved posts"
      sub="A private shelf for posts you want to return to. Only you can see this list."
      actions={<Link className="btn btn-ghost btn-sm" href="/commons">The Commons</Link>}
    >
      {posts.length === 0 ? (
        <EmptyState
          glyph="☆"
          title="Nothing saved yet."
          body="Use Save on a post to keep it here for later. Your saved list is private."
        />
      ) : (
        <div className="stack stack-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} csrfToken={csrfToken} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
