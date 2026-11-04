import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { ArchiveObjectForm } from '~/components/archive/archive-object-form';
import { requireCapability } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Contribute to the Archive' };

export default async function NewArchiveObjectPage() {
  const { actor } = await requireCapability('archive_contribute');
  void actor;
  const csrfToken = await sessionCsrfToken();

  return (
    <PageShell title="Contribute an object" sub="The Archive is the collective memory of the Arch.">
      <div className="page-split-nav">
        <nav className="side-nav" aria-label="Archive">
          <Link href="/archive">All objects</Link>
          <Link href="/exchange">The Exchange</Link>
          <Link href="/archive/new">Contribute</Link>
        </nav>
        <div className="stack stack-5">
          <ArchiveObjectForm csrfToken={csrfToken} />
        </div>
      </div>
    </PageShell>
  );
}
