import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { collectionBySlug, collectionContents } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Archive collection' };

export default async function ArchiveCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const collection = await collectionBySlug(slug, actor.userId);
  if (!collection) notFound();
  const contents = await collectionContents(collection.id, actor.userId, 0, 48);

  return (
    <PageShell title={collection.title} sub={collection.blurb || 'A curated shelf in the Archive.'} actions={<Link className="btn btn-ghost btn-sm" href="/archive">Back to Archive</Link>} wide>
      {contents.length === 0 ? (
        <EmptyState glyph="▤" title="This shelf is empty." body="The curator has not added any visible objects yet." />
      ) : (
        <div className="archive-grid">
          {contents.map((object) => (
            <article className="object-card card stack stack-2" key={object.id}>
              <Link href={`/archive/${object.slug}`} className="card-pad stack stack-2">
                <span className="object-catalogue mono">{object.catalogueNumber}</span>
                <h2 className="t-heading">{object.title}</h2>
                <p className="t-small t-subtle">{object.description}</p>
              </Link>
              {object.note && <p className="t-meta">{object.note}</p>}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
