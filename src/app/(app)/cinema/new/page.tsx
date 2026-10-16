import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { FilmCreateForm } from '~/components/cinema/cinema-forms';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Add a film' };

export default async function NewFilmPage() {
  await requireOnboarded();
  return (
    <PageShell title="Add a film" sub="Use legitimate availability links; never link to pirated copies.">
      <FilmCreateForm csrf={<CsrfField />} />
    </PageShell>
  );
}
