import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { GalleryComposer } from '~/components/gallery/gallery-composer';
import { requireOnboarded } from '~/server/guard';
import { galleryPosts } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'The Gallery' };

export default async function GalleryPage() {
  const { actor } = await requireOnboarded();
  const [pieces, csrfToken] = await Promise.all([
    galleryPosts({ viewerId: actor.userId, limit: 48 }),
    sessionCsrfToken(),
  ]);

  return (
    <PageShell title="The Gallery" sub="Work made by members: photography, art, writing, music, and experiments." wide>
      <GalleryComposer csrfToken={csrfToken} />
      <section className="stack stack-3">
        <h2 className="section-heading">Recent work</h2>
        {pieces.length === 0 ? (
          <div className="panel panel-body"><h3>The walls are waiting</h3><p className="t-small t-muted">Share a piece of your own or come back when the first work is published.</p></div>
        ) : pieces.map((piece) => (
          <article key={piece.id} className="panel panel-body">
            <div className="row row-3">
              {piece.coverUrl && <img src={piece.coverUrl} alt="" width={96} height={96} className="gallery-cover" />}
              <div className="grow">
                <p className="t-meta">{piece.kind.replaceAll('_', ' ')} · {piece.createdAt.toLocaleDateString()}</p>
                <h3><Link href={'/gallery/' + piece.slug}>{piece.title}</Link></h3>
                <p className="t-small t-muted">{piece.caption}</p>
                <p className="t-meta">By {piece.author.displayName} · {piece.mediaCount} media · {piece.commentCount} comments</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
