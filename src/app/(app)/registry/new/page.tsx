import { redirect } from 'next/navigation';

/** Registry entries are system-issued achievements, not user-created objects. */
export default function NewRegistryItemPage(): never {
  redirect('/registry');
}
