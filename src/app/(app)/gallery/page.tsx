import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { galleryPosts } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'The Gallery' };

export default async function GalleryPage() {
  const { actor } = await requireOnboarded();
  const posts = await galleryPosts({ viewerId: actor.userId, limit: 36 });

  return (
    <PageShell
      title="The Gallery"
      sub="Creative work, shared deliberately."
      wide
      actions={<Link className="btn btn-primary btn-sm" href="/gallery/new">Share work</Link>}
    >
      {posts.length === 0 ? (
        <EmptyState
          glyph="❖"
          title="The Gallery is quiet."
          body="Publish writing, art, photography, animation, design, or music for other members to discover."
          action={<Link className="btn btn-primary" href="/gallery/new">Share your work</Link>}
        />
      ) : (
        <div className="archive-grid">
          {posts.map((post) => (
            <Link href={`/gallery/${post.slug}`} key={post.id} className="card card-interactive stack stack-3">
              {post.coverUrl && (
                <div className="object-preview">
                  {/* The object endpoint is member-authenticated and no-store. */}
                  <img src={post.coverUrl} alt="" loading="lazy" />
                </div>
              )}
              <div className="panel-body stack stack-2">
                <span className="badge">{post.kind.replaceAll('_', ' ')}</span>
                <h2 className="t-heading">{post.title}</h2>
                <p className="t-small t-subtle">{post.caption || post.body?.slice(0, 180) || 'A creative work shared with the Arch.'}</p>
                <p className="t-meta">@{post.author.username} · {post.reactionCount} reactions · {post.commentCount} comments · {post.mediaCount} files</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
