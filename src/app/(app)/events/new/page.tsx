import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { EventCreateForm } from '~/components/events/event-forms';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Create an event' };

export default async function NewEventPage() {
  await requireOnboarded();
  return (
    <PageShell title="Create an event" sub="Keep the location and attendee information as minimal as possible.">
      <EventCreateForm csrf={<CsrfField />} />
    </PageShell>
  );
}
