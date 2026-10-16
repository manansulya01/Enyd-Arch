import type { Metadata } from 'next';
import Link from 'next/link';
import RegistryCard from '~/components/registry/registry-card';

// This is a placeholder for the registry items data.
// In a real implementation, this would be fetched from server actions.
const REGISTRY_ITEMS: Array<{ id: string; title: string; description: string }> = [
  { id: '1', title: 'Sample Item 1', description: 'This is a sample registry item.' },
  { id: '2', title: 'Sample Item 2', description: 'Another sample registry item.' },
];

export const metadata: Metadata = {
  title: 'Registry',
  description: 'Browse the registry of items.',
};

export default function RegistryPage() {
  return (
    <section className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Registry</h1>
        <Link href="/registry/new" className="btn-primary">
          New Item
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REGISTRY_ITEMS.map((item) => (
          <Link key={item.id} href={`/registry/${item.id}`} className="block">
            <RegistryCard item={item} />
          </Link>
        ))}
      </div>
    </section>
  );
}