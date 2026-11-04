import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState, Avatar } from '~/components/ui';
import { archiveObjects, collections } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { ARCHIVE_CATEGORIES, COPY, MARK } from '~/lib/domain';
import { formatBytes, relativeTime, volumeDesignator } from '~/lib/format';

export const metadata: Metadata = { title: 'The Archive' };

const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'discussed', label: 'Most discussed' },
  { value: 'popular', label: 'Most downloaded' },
  { value: 'catalogue', label: 'Catalogue order' },
];

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; tag?: string; sort?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const sort = (SORTS.find((entry) => entry.value === params.sort)?.value ?? 'recent') as
    | 'recent'
    | 'discussed'
    | 'popular'
    | 'catalogue';

  const [objects, shelves] = await Promise.all([
    archiveObjects({
      viewerId: actor.userId,
      category: params.category ?? null,
      tag: params.tag ?? null,
      query: params.q ?? null,
      sort,
      limit: 36,
    }),
    collections({ limit: 6 }),
  ]);

  return (
    <PageShell
      title="The Archive"
      sub={COPY.archive.body}
      wide
      actions={
        <Link className="btn btn-primary btn-sm" href="/archive/new">
          Contribute an object
        </Link>
      }
    >
      <div className="page-split">
        <div className="stack stack-5">
          <form className="row row-4" action="/archive" method="get" role="search">
            <label className="sr-only" htmlFor="archive-search">
              Search the Archive
            </label>
            <input
              id="archive-search"
              className="input input-search grow"
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search titles and descriptions…"
            />
            <select className="select" name="sort" defaultValue={sort} aria-label="Sort">
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" type="submit">
              Search
            </button>
          </form>

          <div className="category-rail">
            <Link className="badge" href="/archive">
              Everything
            </Link>
            {ARCHIVE_CATEGORIES.map((category) => (
              <Link
                key={category.key}
                className={`badge ${params.category === category.key ? 'badge-accent' : ''}`}
                href={`/archive?category=${category.key}`}
                title={category.blurb}
              >
                <span aria-hidden="true">{category.glyph}</span> {category.label}
              </Link>
            ))}
          </div>

          {objects.length === 0 ? (
            <EmptyState
              glyph="▤"
              title={params.q || params.category ? 'Nothing matches that yet.' : 'The shelves are empty.'}
              body="Everything interesting eventually finds its way here. Contribute the first object."
              action={
                <Link className="btn btn-primary" href="/archive/new">
                  Contribute an object
                </Link>
              }
            />
          ) : (
            <div className="archive-grid">
              {objects.map((object) => (
                <article className="object-card card" key={object.id}>
                  <div className="row row-between">
                    <span className="object-catalogue mono">{object.catalogueNumber}</span>
                    {object.featured && (
                      <span className="featured-flag">Curated</span>
                    )}
                  </div>
                  <h2 className="object-title">
                    <Link href={`/archive/${object.slug}`}>{object.title}</Link>
                  </h2>
                  <p className="object-desc">{object.description || 'No description yet.'}</p>
                  {object.tags.length > 0 && (
                    <div className="shared-tags">
                      {object.tags.map((tag) => (
                        <Link className="tag-link" href={`/archive?tag=${encodeURIComponent(tag)}`} key={tag}>
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="row row-between object-foot">
                    <span className="t-meta">
                      {object.categoryLabel} · {formatBytes(object.file?.byteSize ?? 0)}
                    </span>
                    {object.contributor && (
                      <Link className="t-meta" href={`/network/${object.contributor.username}`}>
                        @{object.contributor.username}
                      </Link>
                    )}
                  </div>
                  <p className="t-meta">
                    {volumeDesignator(Number(object.catalogueNumber.replace(/\D/g, '')))} ·{' '}
                    {relativeTime(object.createdAt)} · {object.downloadCount} downloads
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Featured collections</span>
            </div>
            <div className="panel-body stack stack-3">
              {shelves.length === 0 ? (
                <p className="t-small t-subtle">
                  No collections yet. Archivists arrange the shelves into collections.
                </p>
              ) : (
                shelves.map((collection) => (
                  <Link className="row row-4" href={`/archive/collections/${collection.slug}`} key={collection.id}>
                    <span className="act-glyph" aria-hidden="true">
                      ❒
                    </span>
                    <span className="stack">
                      <span>{collection.title}</span>
                      <span className="t-meta">
                        {collection.itemCount} objects
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="t-label">About the catalogue</span>
            </div>
            <div className="panel-body">
              <p className="t-small t-subtle">
                <span aria-hidden="true">{MARK}</span> Objects carry a catalogue number
                (ARC-000000) and a shelf designation. Numbers are never reused. Contributors are
                credited; rights stay with whoever made the work.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

