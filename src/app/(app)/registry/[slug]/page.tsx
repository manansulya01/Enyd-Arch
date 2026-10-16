import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// This is a placeholder for fetching a registry item by id.
// In a real implementation, this would call a server action.
async function getRegistryItem(id: string) {
  // Placeholder data
  const ITEMS = [
    { id: '1', title: 'Sample Item 1', description: 'This is a sample registry item.', details: 'More details about item 1.' },
    { id: '2', title: 'Sample Item 2', description: 'Another sample registry item.', details: 'More details about item 2.' },
  ];

  return ITEMS.find((item) => item.id === id) || null;
}

export const generateMetadata = async ({ params }: { params: { slug: string } }): Promise<Metadata> => {
  const item = await getRegistryItem(params.slug);
  if (!item) {
    notFound();
  }

  return {
    title: item.title,
    description: item.description,
  };
};

export default async function RegistryItemPage({ params }: { params: { slug: string } }) {
  const item = await getRegistryItem(params.slug);

  if (!item) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{item.title}</h1>
        <div className="flex space-x-3">
          <a href="/registry" className="btn-secondary">
            Back to Registry
          </a>
          <a href={`/registry/${item.id}/edit`} className="btn-primary">
            Edit
          </a>
        </div>
      </header>

      <div className="prose lg:prose-xl">
        <p>{item.description}</p>
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Details</h2>
          <p>{item.details}</p>
        </section>
      </div>
    </section>
  );
}