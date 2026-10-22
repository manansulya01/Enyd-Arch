import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { BookmarkButton } from '~/components/commons/bookmark-button';
import { galleryBySlug, galleryMedia, isBookmarked } from '~/server/queries';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { actor } = await requireOnboarded();
  const piece = await galleryBySlug(slug, actor.userId);
  return piece ? { title: piece.title, description: piece.caption || piece.body || 'A piece in The Gallery' } : { title: 'Piece not found' };
}

export default async function GalleryPiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [piece, media] = await Promise.all([galleryBySlug(slug, actor.userId), galleryMedia(slug)]);
  if (!piece) notFound();
  const [csrfToken, bookmarked] = await Promise.all([
    sessionCsrfToken(),
    isBookmarked(actor.userId, 'gallery_post', piece.id),
  ]);

  return (
    <PageShell title={piece.title} sub={piece.kind.replaceAll('_', ' ')} wide>
      <article className="panel panel-body stack-3">
        <p className="t-meta">By {piece.author.displayName} · {piece.createdAt.toLocaleDateString()} · {piece.viewCount} views</p>
        {piece.caption && <p className="t-small t-muted">{piece.caption}</p>}
        {piece.coverUrl && <img src={piece.coverUrl} alt="" className="gallery-hero" />}
        {piece.body && <div className="prose-content"><p>{piece.body}</p></div>}
        {media.length > 0 && (
          <div className="stack stack-3">
            <h2 className="section-heading">Attached media</h2>
            {media.map((file) => (
              <a key={file.fileId} className="row row-3" href={'/objects/' + file.fileId}>
                <span className="grow">{file.displayName}</span>
                <span className="t-meta">{Math.round(file.byteSize / 1024)} KB</span>
              </a>
            ))}
          </div>
        )}
        <div className="row row-between row-wrap">
          <p className="t-meta">{piece.reactionCount} reactions · {piece.commentCount} comments</p>
          {(['public', 'members'].includes(piece.visibility) || bookmarked) && <BookmarkButton targetType="gallery_post" targetId={piece.id} csrfToken={csrfToken} initialSaved={bookmarked} />
        </div>
        <Link className="btn btn-ghost" href="/gallery">Back to the Gallery</Link>
      </article>
    </PageShell>
  );
}
