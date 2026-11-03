import { redirect } from 'next/navigation';

/** Legacy registry links now resolve to the canonical Archive catalogue. */
export default function RegistryItemPage(): never {
  redirect('/archive');
}
