import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Registry',
  description: 'Browse the Enyd Arch Archive.',
};

/** Preserve old links while keeping one canonical catalogue implementation. */
export default function RegistryPage(): never {
  redirect('/archive');
}
