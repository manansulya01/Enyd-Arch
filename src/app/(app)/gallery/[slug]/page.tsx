import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '~db';
import { galleryComments, users } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { CsrfField } from '~/components/shell/csrf-field';
import { GalleryCommentForm } from '~/components/gallery/gallery-create-form';
import { galleryBySlug } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Gallery work' };

export default async function GalleryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const post = await galleryBySlug(slug, actor.userId);
  if (!post) notFound();
  const comments = await db.select({
    id: galleryComments.id,
    body: galleryComments.body,
    createdAt: galleryComments.createdAt,
    username: users.username,
    displayName: users.displayName,
  }).from(galleryComments)
    .innerJoin(users, eq(users.id, galleryComments.authorId))
    .where(and(eq(galleryComments.postId, post.id), eq(galleryComments.status, 'published'), isNull(galleryComments.removedAt)))
    .orderBy(desc(galleryComments.createdAt)).limit(100);

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
          <ReactionBar targetType="gallery_post" targetId={post.id} myReactions={post.myReactions} count={post.reactionCount} />
        </div>
        <section className="stack stack-3">
          <h2 className="t-heading">Comments</h2>
          {comments.length === 0 ? <p className="t-subtle">No comments yet.</p> : comments.map((comment) => (
            <article className="card card-pad stack stack-1" key={comment.id}>
              <p className="t-body">{comment.body}</p>
              <p className="t-meta">@{comment.username} · {comment.createdAt.toLocaleDateString()}</p>
            </article>
          ))}
        </section>
        <GalleryCommentForm postId={post.id} csrf={<CsrfField />} />
      </article>
    </PageShell>
  );
}
