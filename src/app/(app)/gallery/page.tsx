import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { galleryPosts } from '~/server/queries';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'The Gallery' };

export default async function GalleryPage() {
  const { actor } = await requireOnboarded();
  const posts = await galleryPosts({ viewerId: actor.userId, limit: 36 });

  return (
    <PageShell title="The Gallery" sub="Creative work made and shared by members.">
      {posts.length === 0 ? (
        <EmptyState glyph="❖" title="The walls are still empty." body="Photography, art, writing, animation and design shared by the community will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link className="card card-pad-md stack stack-2" href={`/gallery/${post.slug}`} key={post.id}>
              {post.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.coverUrl} alt="" className="w-full rounded-lg object-cover" />
              )}
              <span className="t-meta">{post.kind.replaceAll('_', ' ')} · {post.mediaCount} media</span>
              <h2 className="t-section">{post.title}</h2>
              {post.caption && <p className="t-small t-subtle">{post.caption}</p>}
              <span className="t-meta">by {post.author.displayName} · {relativeTime(post.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
