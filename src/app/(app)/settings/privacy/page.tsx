import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { sessionCsrfToken } from '~/server/csrf';
import { db } from '~db';
import { userSettings } from '~db/schema';
import { savePrivacySettings } from '~/server/actions/privacy-settings';
import { deactivateAccount } from '~/server/actions/account-lifecycle';

export const metadata: Metadata = {
  title: 'Privacy settings',
  description: 'Control how your Enyd Arch profile and activity are shared.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

const DEFAULTS = {
  profileVisibility: 'members',
  messagePolicy: 'members',
  showReadReceipts: true,
  discoverable: true,
  searchableByEmail: false,
  showRegion: false,
  hideAgeBand: false,
  showActivity: true,
  showCreations: true,
  showArchiveContributions: true,
  notifyOnMessage: true,
  notifyOnReply: true,
  notifyOnMention: true,
  notifyOnReaction: false,
  notifyOnConnection: true,
  notifyOnProject: true,
  notifyOnEvent: true,
  notifyOnFile: false,
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
      actions={
        <>
          <Link className="btn btn-ghost btn-sm" href="/settings/security">Security and devices</Link>
          <Link className="btn btn-ghost btn-sm" href="/privacy">Privacy notice</Link>
        </>
      }
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
              <input type="checkbox" name="searchableByEmail" defaultChecked={settings.searchableByEmail} />
              <span>Allow members who already know my email address to find my account</span>
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
            <label className="check-row">
              <input type="checkbox" name="showReadReceipts" defaultChecked={settings.showReadReceipts} />
              <span>Let other members see when I have read their messages</span>
            </label>
            <p className="t-small t-subtle">
              Email is never displayed on your public profile. This option only controls account discovery.
              Privacy settings do not make content end-to-end encrypted or prevent authorized service operators
              from processing data needed to run the service.
            </p>
          </section>

          <section className="panel-body stack stack-3">
            <h2>Notification preferences</h2>
            <p className="t-small t-subtle">Choose which activity creates in-app notifications. Security and account notices remain enabled.</p>
            <label className="check-row"><input type="checkbox" name="notifyOnMessage" defaultChecked={settings.notifyOnMessage} /><span>New private messages</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnReply" defaultChecked={settings.notifyOnReply} /><span>Replies to my posts and comments</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnMention" defaultChecked={settings.notifyOnMention} /><span>Mentions</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnReaction" defaultChecked={settings.notifyOnReaction} /><span>Reactions to my content</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnConnection" defaultChecked={settings.notifyOnConnection} /><span>Connection requests and updates</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnProject" defaultChecked={settings.notifyOnProject} /><span>Project invitations and activity</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnEvent" defaultChecked={settings.notifyOnEvent} /><span>Event invitations and reminders</span></label>
            <label className="check-row"><input type="checkbox" name="notifyOnFile" defaultChecked={settings.notifyOnFile} /><span>File activity</span></label>
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
            contributions, connection records, music, media, events, Arcade activity, and project records. Passwords, session tokens, and security secrets are excluded. Export requests are audited, but export contents are not logged.
          </p>
          <div>
            <a className="btn btn-secondary" href="/api/account/export">Export my account data</a>
          </div>
        </section>

        <section className="panel panel-body stack stack-2" aria-labelledby="account-deactivation">
          <h2 id="account-deactivation">Deactivate this account</h2>
          <p className="t-small t-subtle">
            Deactivation hides your account, prevents sign-in, makes your profile private, stops new messages,
            and revokes all active sessions. Your records are retained under the service retention policy;
            this is not a permanent data-erasure request. Contact support for an erasure review.
          </p>
          <form action={deactivateAccount} className="stack stack-2">
            <input type="hidden" name="__csrf" value={csrfToken} />
            <label className="field">
              <span className="field-label">Type DEACTIVATE to confirm</span>
              <input className="input" name="confirmation" autoComplete="off" required pattern="DEACTIVATE" />
            </label>
            <div><button className="btn btn-danger" type="submit">Deactivate my account</button></div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
