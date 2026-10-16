import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { RegistryEditor } from '~/components/registry/registry-editor';
import { currentActor } from '~/server/auth/session';
import { getRegistryItemById } from '~/server/actions/registry';

export const metadata: Metadata = {
  title: 'Edit Registry Entry',
  description: 'Edit a Registry entry you own.',
};

export default async function EditRegistryItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, actor] = await Promise.all([getRegistryItemById(slug), currentActor()]);
  if (!result.ok || !result.data) notFound();
  if (!actor || actor.userId !== result.data.ownerId) redirect(`/registry/${slug}`);

  return (
    <PageShell title="Edit Registry Entry" sub="Only the author can change this entry.">
      <RegistryEditor
        mode="edit"
        item={{
          id: result.data.id,
          title: result.data.title,
          description: result.data.description,
          details: result.data.details,
        }}
        csrf={<CsrfField />}
      />
    </PageShell>
  );
}
