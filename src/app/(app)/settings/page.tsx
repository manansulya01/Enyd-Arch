import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { loadOnboardingContext } from '~/server/onboarding-context';
import { sessionCsrfToken } from '~/server/csrf';
import { savePrivacySettings } from '~/server/actions/settings-client';

export const metadata: Metadata = { title: 'Privacy settings' };

export default async function SettingsPage() {
  const { actor } = await requireOnboarded();
  const [context, csrf] = await Promise.all([
    loadOnboardingContext(actor.userId),
    sessionCsrfToken(),
  ]);
  const settings = context.settings;

  return (
    <PageShell title="Privacy settings" sub="Choose what other members can discover and how they can contact you.">
      <form action={savePrivacySettings} className="card card-pad-lg stack stack-4">
        <input type="hidden" name="__csrf" value={csrf} />
        <label className="field">
          <span className="field-label">Profile visibility</span>
          <select className="input" name="profileVisibility" defaultValue={settings.profileVisibility}>
            <option value="public">Public to anyone with the link</option>
            <option value="members">Signed-in members</option>
            <option value="connections">Accepted connections only</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Who can message you</span>
          <select className="input" name="messagePolicy" defaultValue={settings.messagePolicy}>
            <option value="everyone">Everyone</option>
            <option value="members">Members</option>
            <option value="connections">Accepted connections</option>
            <option value="nobody">Nobody</option>
          </select>
        </label>
        <fieldset className="stack stack-3">
          <legend className="t-label">Discovery and activity</legend>
          {[
            ['discoverable', 'Allow your profile to appear in member search', settings.discoverable],
            ['showActivity', 'Show your activity totals on your profile', settings.showActivity],
            ['showCreations', 'Show your creative work on your profile', settings.showCreations],
            ['showArchiveContributions', 'Show your Archive contributions', settings.showArchiveContributions],
            ['showRegion', 'Show your coarse region', settings.showRegion],
          ].map(([name, label, checked]) => (
            <label className="row row-2" key={String(name)}>
              <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
              <span>{String(label)}</span>
            </label>
          ))}
        </fieldset>
        <p className="t-meta">Exact location, legal name, email address and device identifiers are never shown on your public profile.</p>
        <div className="row row-end">
          <button className="btn btn-primary" type="submit">Save privacy settings</button>
        </div>
      </form>
    </PageShell>
  );
}
