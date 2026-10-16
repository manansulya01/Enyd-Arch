import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import RegistryCard from '~/components/registry/registry-card';
import { getRegistryItems } from '~/server/actions/registry';

export const metadata: Metadata = {
  title: 'Registry',
  description: 'A member-only catalogue of things worth keeping.',
};

export default async function RegistryPage() {
  const result = await getRegistryItems();
  const items = result.ok ? result.data ?? [] : [];

  return (
    <PageShell
      title="Registry"
      sub="A considered catalogue, kept by its members."
      actions={
        <Link href="/registry/new" className="btn btn-primary btn-sm">
          New entry
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          glyph="▤"
          title={result.ok ? 'The Registry is empty.' : 'The Registry is unavailable.'}
          body={
            result.ok
              ? 'Create the first entry. It will be visible to signed-in members.'
              : result.message ?? 'Sign in again and try once more.'
          }
          action={
            <Link href="/registry/new" className="btn btn-primary">
              Create an entry
            </Link>
          }
        />
      ) : (
        <div className="archive-grid">
          {items.map((item) => (
            <Link key={item.id} href={`/registry/${item.id}`} className="card card-pad card-interactive">
              <RegistryCard item={item} />
              <p className="t-meta">Updated {item.updatedAt.toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
