import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { GalleryCreateForm } from '~/components/gallery/gallery-create-form';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Share work' };

export default async function NewGalleryPostPage() {
  await requireOnboarded();
  return (
    <PageShell title="Share work" sub="Writing can live here without an attachment; other media is scanned before publication.">
      <GalleryCreateForm csrf={<CsrfField />} />
    </PageShell>
  );
}
