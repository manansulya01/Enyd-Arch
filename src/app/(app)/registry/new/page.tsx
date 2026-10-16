import type { Metadata } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';

// Placeholder for the server action to create a registry item.
// In a real implementation, this would be imported from '~/server/actions/registry'
async function createRegistryItem(data: FormData) {
  // Placeholder: simulate an API call
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 1000);
  });
}

export const metadata: Metadata = {
  title: 'New Registry Item',
  description: 'Create a new registry item.',
};

export default function NewRegistryItemPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [details, setDetails] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createRegistryItem(e);
        // In a real app, we would redirect to the new item's page
        // For now, we'll just reset the form and show a success message.
        setTitle('');
        setDescription('');
        setDetails('');
        // You could also set a success state here.
      } catch (err) {
        setError('Failed to create registry item. Please try again.');
      }
    });
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">New Registry Item</h1>
        <Link href="/registry" className="btn-secondary">
          Back to Registry
        </Link>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="title"
            type="text"
            required
            className="block w-full rounded-md border-0 px-3 py-2 text-sm ring-offset-0 ring-offset-stroke ring-2 ring-offset-2 focus:ring-2 focus:ring-primary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-2">
            Description
          </label>
          <textarea
            id="description"
            required
            className="block w-full rounded-md border-0 px-3 py-2 text-sm ring-offset-0 ring-offset-stroke ring-2 ring-offset-2 focus:ring-2 focus:ring-primary"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="details" className="block text-sm font-medium mb-2">
            Details (optional)
          </label>
          <textarea
            id="details"
            className="block w-full rounded-md border-0 px-3 py-2 text-sm ring-offset-0 ring-offset-stroke ring-2 ring-offset-2 focus:ring-2 focus:ring-primary"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center justify-start space-x-3">
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary"
          >
            {isPending ? 'Creating...' : 'Create Item'}
          </button>
        </div>
      </form>
    </section>
  );
}