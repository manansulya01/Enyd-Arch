import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState } from '~/components/ui';
import { ArchiveComments } from '~/components/archive/archive-comments';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { archiveBySlug, archiveComments } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { ARCHIVE_CATEGORY_MAP } from '~/lib/domain';
import { absoluteDate, formatBytes, volumeDesignator } from '~/lib/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return { title: 'Archive object' };
}

export default async function ArchiveObjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;

  const object = await archiveBySlug(slug, actor.userId);
  if (!object) notFound();

  const [comments, csrfToken] = await Promise.all([
    archiveComments(object.id, actor.userId),
    sessionCsrfToken(),
  ]);
  const catalogueNumber = Number(object.catalogueNumber.replace(/\D/g, ''));
  const inlineImage = object.file?.contentType.startsWith('image/') ?? false;

  return (
    <PageShell title={object.title} sub={`${object.catalogueNumber} · ${object.categoryLabel}`}>
      <div className="page-split">
        <div className="stack stack-5">
          <Link className="lnk" href="/archive">
            ← Back to the Archive
          </Link>

          <article className="card card-pad-lg stack stack-4">
            <div className="row row-between">
              <span className="object-catalogue mono">{object.catalogueNumber}</span>
              <span className="badge badge-plain">{object.categoryLabel}</span>
            </div>

            <p className="t-lede">{object.description || 'No description was provided.'}</p>

            {object.file ? (
              inlineImage ? (
                <img
                  className="frame"
                  src={`/files/${object.file.id}`}
                  alt={object.title}
                  style={{ maxHeight: 460, width: '100%', objectFit: 'contain' }}
                />
              ) : object.file.contentType.startsWith('audio/') ? (
                <audio controls src={`/files/${object.file.id}`} style={{ width: '100%' }}>
                  Your browser cannot play this audio file.
                </audio>
              ) : object.file.contentType.startsWith('video/') ? (
                <video controls src={`/files/${object.file.id}`} style={{ width: '100%' }}>
                  Your browser cannot play this video.
                </video>
              ) : (
                <p className="upload-row">
                  <span className="upload-row-glyph" aria-hidden="true">
                    ▤
                  </span>
                  <span className="truncate">{object.file.displayName}</span>
                  <span className="t-meta">{formatBytes(object.file.byteSize)}</span>
                </p>
              )
            ) : null}

            <div className="row row-wrap">
              {object.file && (
                <a className="btn btn-primary btn-sm" href={`/files/${object.file.id}?download=1`}>
                  Download
                </a>
              )}
              <ReactionBar
                csrfToken={csrfToken}
                targetType="archive_object"
                targetId={object.id}
                myReactions={object.myReactions}
                count={object.reactionCount}
              />
            </div>

            {object.tags.length > 0 && (
              <div className="shared-tags">
                {object.tags.map((tag) => (
                  <Link className="tag-link" href={`/archive?tag=${encodeURIComponent(tag)}`} key={tag}>
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            <div className="profile-facts">
              <div className="profile-fact">
                <span className="profile-fact-label">Shelf</span>
                <span className="profile-fact-value">{volumeDesignator(catalogueNumber)}</span>
              </div>
              <div className="profile-fact">
                <span className="profile-fact-label">Category</span>
                <span className="profile-fact-value">
                  {ARCHIVE_CATEGORY_MAP[object.category]?.label ?? object.category}
                </span>
              </div>
              <div className="profile-fact">
                <span className="profile-fact-label">Access</span>
                <span className="profile-fact-value">
                  {object.visibility === 'public' ? 'Members and public' : 'Members only'}
                </span>
              </div>
              <div className="profile-fact">
                <span className="profile-fact-label">Added</span>
                <span className="profile-fact-value">{absoluteDate(object.createdAt)}</span>
              </div>
              <div className="profile-fact">
                <span className="profile-fact-label">Downloads</span>
                <span className="profile-fact-value">{object.downloadCount}</span>
              </div>
              <div className="profile-fact">
                <span className="profile-fact-label">Rights</span>
                <span className="profile-fact-value">{object.license}</span>
              </div>
            </div>

            {object.contributor && (
              <div className="row row-4">
                <Avatar
                  displayName={object.contributor.displayName}
                  avatarUrl={object.contributor.avatarUrl}
                  size="sm"
                />
                <span className="t-small">
                  Contributed by{' '}
                  <Link className="lnk" href={`/network/${object.contributor.username}`}>
                    {object.contributor.displayName}
                  </Link>{' '}
                  <span className="t-meta">
                    @{object.contributor.username} · {object.contributor.memberId}
                  </span>
                </span>
              </div>
            )}
          </article>

          <ArchiveComments objectId={object.id} comments={comments} />
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">Rights and conduct</span>
            </div>
            <div className="panel-body">
              <p className="t-small t-subtle">
                Share only what you have the right to share. Enyd Arch does not host copyrighted
                films, music or games; members link to legitimate sources instead.
              </p>
            </div>
          </div>
          {comments.length === 0 && (
            <EmptyState glyph="❝" title="No discussion yet." body="Be the first to annotate this object." />
          )}
        </aside>
      </div>
    </PageShell>
  );
}
