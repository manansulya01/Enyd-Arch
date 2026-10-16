import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { NetworkForm } from '../network-form';
import { requireCapability } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Share on Network' };

export default async function NewNetworkPage() {
  const { actor } = await requireCapability('network_contribute');
  void actor;
  const csrfToken = await sessionCsrfToken();

  return (
    <PageShell title="Share on Network" sub="Connect with fellow members.">
      <div className="page-split-nav">
        <nav className="side-nav" aria-label="Network">
          <Link href="/network">All posts</Link>
          <Link href="/exchange">The Exchange</Link>
          <Link href="/network/new">Share</Link>
        </nav>
        <div className="stack stack-5">
          <NetworkForm csrfToken={csrfToken} />
        </div>
      </div>
    </PageShell>
  );
}