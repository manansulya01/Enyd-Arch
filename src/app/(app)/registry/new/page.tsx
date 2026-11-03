import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'New Registry Item',
  description: 'Create a new entry in the Enyd Arch archive.',
};

/** Registry is the legacy name for the Archive catalogue. */
export default function NewRegistryItemPage(): never {
  redirect('/archive/new');
}
