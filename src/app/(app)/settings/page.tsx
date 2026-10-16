import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { userSettings } from '~db/schema';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { SettingsForm, type SettingsInitial } from '~/components/settings/settings-form';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Privacy and settings' };

export default async function SettingsPage() {
  const { actor } = await requireOnboarded();
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, actor.userId)).limit(1);
  const initial: SettingsInitial = {
    profileVisibility: row?.profileVisibility ?? 'members',
    messagePolicy: row?.messagePolicy ?? 'members',
    theme: row?.theme ?? 'dark',
    showActivity: row?.showActivity ?? true,
    showCreations: row?.showCreations ?? true,
    showArchiveContributions: row?.showArchiveContributions ?? true,
    discoverable: row?.discoverable ?? true,
    showRegion: row?.showRegion ?? false,
    connectionsEnabled: row?.connectionsEnabled ?? false,
    allowFriendRequests: row?.allowFriendRequests ?? true,
    hideAgeBand: row?.hideAgeBand ?? false,
    reduceMotion: row?.reduceMotion ?? false,
    notifyOnMessage: row?.notifyOnMessage ?? true,
    notifyOnReply: row?.notifyOnReply ?? true,
    notifyOnMention: row?.notifyOnMention ?? true,
    notifyOnReaction: row?.notifyOnReaction ?? false,
    notifyOnConnection: row?.notifyOnConnection ?? true,
    notifyOnProject: row?.notifyOnProject ?? true,
    notifyOnEvent: row?.notifyOnEvent ?? true,
    notifyOnFile: row?.notifyOnFile ?? false,
    notifyOnModeration: row?.notifyOnModeration ?? true,
    notifyEmailDigest: row?.notifyEmailDigest ?? false,
  };

  return (
    <PageShell title="Privacy and settings" sub="Choose what other members can see and which notifications reach you.">
      <SettingsForm csrf={<CsrfField />} initial={initial} />
    </PageShell>
  );
}
