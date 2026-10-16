import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { ExchangeUploader } from '~/components/exchange/uploader';
import { requireCapability } from '~/server/guard';
import { recentFilesForUser } from '~/server/storage/uploads';
import { formatBytes, relativeTime } from '~/lib/format';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'The Exchange' };

const ALLOWED = [
  { kind: 'image', glyph: '◉', label: 'Images', types: 'PNG, JPEG, GIF, WebP, AVIF, BMP' },
  { kind: 'audio', glyph: '♪', label: 'Audio', types: 'MP3, M4A, OGG, WAV, FLAC' },
  { kind: 'video', glyph: '▶', label: 'Video', types: 'MP4, WebM, MOV, M4V' },
  { kind: 'document', glyph: '▤', label: 'Documents', types: 'PDF, TXT, MD, CSV, RTF, EPUB' },
  { kind: 'archive', glyph: '⛁', label: 'Archives', types: 'ZIP' },
];

export default async function ExchangePage() {
  const { actor } = await requireCapability('upload');
  const [mine, csrfToken] = await Promise.all([recentFilesForUser(actor.userId, 20), sessionCsrfToken()]);

  return (
    <PageShell
      title="The Exchange"
      sub="Upload, check, and share. Everything here is validated and scanned before anyone else can see it."
      actions={
        <Link className="btn btn-primary btn-sm" href="/archive/new">
          Catalogue as an Archive object
        </Link>
      }
    >
      <div className="page-split">
        <div className="stack stack-5">
          <ExchangeUploader csrfToken={csrfToken} />

          <section className="panel" aria-labelledby="your-uploads">
            <div className="panel-head">
              <span className="t-label" id="your-uploads">
                Your uploads
              </span>
            </div>
            <div className="panel-body stack stack-2">
              {mine.length === 0 ? (
                <EmptyState
                  glyph="⇄"
                  title="You have not uploaded anything yet."
                  body="Your uploads stay private until you attach them to a post, an Archive object, or a project."
                />
              ) : (
                mine.map((file) => (
                  <div className="upload-row" key={file.id}>
                    <span className="upload-row-glyph" aria-hidden="true">
                      {file.detectedMime?.startsWith('image/') ? '◉' : '⇄'}
                    </span>
                    <a className="truncate lnk" href={`/files/${file.id}${file.detectedMime?.startsWith('image/') ? '' : '?download=1'}`}>
                      {file.displayName}
                    </a>
                    <span className="t-meta">
                      {formatBytes(file.byteSize)} · {relativeTime(file.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="aside">
          <div className="panel">
            <div className="panel-head">
              <span className="t-label">What is accepted</span>
            </div>
            <div className="panel-body stack stack-3">
              {ALLOWED.map((entry) => (
                <div className="row row-4" key={entry.kind}>
                  <span className="act-glyph" aria-hidden="true">
                    {entry.glyph}
                  </span>
                  <span className="stack">
                    <span className="t-small">{entry.label}</span>
                    <span className="t-meta">{entry.types}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="t-label">How uploads are handled</span>
            </div>
            <div className="panel-body stack stack-2">
              <p className="t-small t-subtle">
                Every upload is checked by its real contents, not the name the browser suggested.
                Executables are refused outright. Anything that fails the scanner is quarantined
                and never becomes reachable.
              </p>
              <p className="t-small t-subtle">
                Files are private to you until you attach them to something published.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
