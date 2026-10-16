import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { RegistryEditor } from '~/components/registry/registry-editor';

export const metadata: Metadata = {
  title: 'New Registry Entry',
  description: 'Create a member-only Registry entry.',
};

export default function NewRegistryItemPage() {
  return (
    <PageShell title="New Registry Entry" sub="Add something worth keeping.">
      <RegistryEditor mode="create" csrf={<CsrfField />} />
    </PageShell>
  );
}
