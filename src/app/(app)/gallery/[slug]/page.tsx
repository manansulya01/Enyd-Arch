import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { requireOnboarded } from '~/server/guard';
import { galleryBySlug, galleryMedia } from '~/server/queries';
import { absoluteDate } from '~/lib/format';

export const metadata: Metadata = { title: 'Gallery work' };

export default async function GalleryPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [post, media] = await Promise.all([
    galleryBySlug(slug, actor.userId),
    galleryMedia(slug),
  ]);
  if (!post) notFound();

  return (
    <PageShell title={post.title} sub={`${post.author.displayName} · ${absoluteDate(post.createdAt)}`}>
      <div className="stack stack-5">
        <Link className="lnk" href="/gallery">← Back to Gallery</Link>
        {post.caption && <p className="t-lead">{post.caption}</p>}
        {post.body && <p className="prose">{post.body}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {media.map((item) => (
            <a className="card card-pad-md stack stack-2" href={`/files/${item.fileId}`} key={item.fileId}>
              <strong>{item.displayName}</strong>
              {item.caption && <span className="t-small t-subtle">{item.caption}</span>}
              <span className="t-meta">{item.detectedMime} · {Math.ceil(item.byteSize / 1024)} KB</span>
              <span className="lnk">Open media</span>
            </a>
          ))}
        </div>
        <ReactionBar targetType="gallery_post" targetId={post.id} myReactions={post.myReactions} count={post.reactionCount} />
      </div>
    </PageShell>
  );
}
