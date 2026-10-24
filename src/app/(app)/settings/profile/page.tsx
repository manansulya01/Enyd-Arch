import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
export default async function ProfileSettingsPage() {
  await requireOnboarded();
  return <PageShell title="Edit profile"><p>Profile settings are being prepared.</p></PageShell>;
}
