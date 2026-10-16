import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { galleryBySlug } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Gallery work' };

export default async function GalleryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const post = await galleryBySlug(slug, actor.userId);
  if (!post) notFound();

  return (
    <PageShell
      title={post.title}
      sub={`${post.kind.replaceAll('_', ' ')} · by @${post.author.username}`}
      actions={<Link className="btn btn-ghost btn-sm" href="/gallery">Back to Gallery</Link>}
      wide
    >
      <article className="stack stack-4">
        {post.coverUrl && <img className="gallery-cover" src={post.coverUrl} alt={post.caption || post.title} />}
        {post.caption && <p className="t-lede">{post.caption}</p>}
        {post.body && <div className="card card-pad-lg prose"><p>{post.body}</p></div>}
        <div className="row row-wrap row-between">
          <span className="t-meta">{post.mediaCount} attached files · {post.viewCount} views</span>
          <ReactionBar targetType="gallery_post" targetId={post.id} myReactions={post.myReactions} />
        </div>
      </article>
    </PageShell>
  );
}
