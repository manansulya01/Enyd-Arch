import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { db } from '~db';
import { userSettings } from '~db/schema';
import { savePrivacySettings } from '~/server/actions/privacy-settings';

export const metadata: Metadata = {
  title: 'Privacy settings',
  description: 'Control how your Enyd Arch profile and activity are shared.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

const DEFAULTS = {
  profileVisibility: 'members',
  messagePolicy: 'members',
  discoverable: true,
  showRegion: false,
  hideAgeBand: false,
  showActivity: true,
  showCreations: true,
  showArchiveContributions: true,
};

export default async function PrivacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { actor } = await requireOnboarded();
  const params = await searchParams;
  const [rows, csrfToken] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, actor.userId)).limit(1),
    sessionCsrfToken(),
  ]);
  const settings = { ...DEFAULTS, ...rows[0] };

  return (
    <PageShell
      title="Privacy settings"
      sub="Choose what other members can discover and how they can contact you."
      actions={<Link className="btn btn-ghost btn-sm" href="/privacy">Privacy notice</Link>}
    >
      <div className="stack stack-4" style={{ maxWidth: 760 }}>
        {params.saved === '1' && <p className="notice notice-success" role="status">Your privacy settings were saved.</p>}
        {params.error && <p className="notice notice-danger" role="alert">
          {params.error === 'slow-down' ? 'Please wait before saving again.' : 'Your settings could not be saved. Reload and try again.'}
        </p>}

        <form action={savePrivacySettings} className="panel stack stack-4">
          <input type="hidden" name="__csrf" value={csrfToken} />

          <section className="panel-body stack stack-3">
            <h2>Profile visibility</h2>
            <label className="field">
              <span className="field-label">Who can view your profile?</span>
              <select className="input" name="profileVisibility" defaultValue={settings.profileVisibility}>
                <option value="public">Anyone (public profile)</option>
                <option value="members">Signed-in members</option>
                <option value="connections">Your connections</option>
                <option value="private">Only you</option>
              </select>
            </label>
            <label className="check-row">
              <input type="checkbox" name="discoverable" defaultChecked={settings.discoverable} />
              <span>Allow my profile to appear in member discovery</span>
            </label>
            <label className="check-row">
              <input type="checkbox" name="showRegion" defaultChecked={settings.showRegion} />
              <span>Show my broad region on my profile</span>
            </label>
            <label className="check-row">
              <input type="checkbox" name="hideAgeBand" defaultChecked={settings.hideAgeBand} />
              <span>Hide my age band from other members</span>
            </label>
            <label className="check-row">
              <input type="checkbox" name="showActivity" defaultChecked={settings.showActivity} />
              <span>Show my recent activity to members who can view my profile</span>
            </label>
            <label className="check-row">
              <input type="checkbox" name="showCreations" defaultChecked={settings.showCreations} />
              <span>Show my creative work on my profile</span>
            </label>
            <label className="check-row">
              <input type="checkbox" name="showArchiveContributions" defaultChecked={settings.showArchiveContributions} />
              <span>Show my Archive contributions on my profile</span>
            </label>
          </section>

          <section className="panel-body stack stack-3">
            <h2>Contact and search</h2>
            <label className="field">
              <span className="field-label">Who can start a message?</span>
              <select className="input" name="messagePolicy" defaultValue={settings.messagePolicy}>
                <option value="everyone">Everyone</option>
                <option value="members">Signed-in members</option>
                <option value="connections">My connections only</option>
                <option value="nobody">Nobody</option>
              </select>
            </label>
            <p className="t-small t-subtle">
              Email is never displayed on your public profile. This option only controls account discovery.
              Privacy settings do not make content end-to-end encrypted or prevent authorized service operators
              from processing data needed to run the service.
            </p>
          </section>

          <div className="panel-body row row-end">
            <button className="btn btn-primary" type="submit">Save privacy settings</button>
          </div>
        </form>

        <section className="panel panel-body stack stack-2" aria-labelledby="account-data-export">
          <h2 id="account-data-export">Your account data</h2>
          <p className="t-small t-subtle">
            Download a private JSON copy of your account details, profile, settings, posts, comments,
            bookmarks, reactions, messages you sent, notifications, file metadata, Archive and Gallery
            contributions, and connection records. Passwords, session tokens, and security secrets are excluded.
          </p>
          <div>
            <a className="btn btn-secondary" href="/api/account/export">Export my account data</a>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
