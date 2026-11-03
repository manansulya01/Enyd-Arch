import type { Metadata } from 'next';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { PageShell } from '~/components/ui/page-shell';
import { requireOnboarded } from '~/server/guard';
import { db } from '~db';
import { devices, sessions } from '~db/schema';
import { sessionCsrfToken } from '~/server/csrf';
import { revokeOtherSessions, submitDeviceTransferRequest } from '~/server/actions/settings-security-client';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'Security settings' };

export default async function SecuritySettingsPage() {
  const { actor } = await requireOnboarded();
  const now = new Date();
  const [deviceRows, sessionRows, csrf] = await Promise.all([
    db.select({
      id: devices.id,
      label: devices.label,
      platform: devices.platform,
      enrolledAt: devices.enrolledAt,
      lastSeenAt: devices.lastSeenAt,
      status: devices.status,
    })
      .from(devices)
      .where(and(eq(devices.userId, actor.userId), isNull(devices.revokedAt)))
      .orderBy(desc(devices.enrolledAt)),
    db.select({
      id: sessions.id,
      deviceId: sessions.deviceId,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
      .from(sessions)
      .where(and(eq(sessions.userId, actor.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .orderBy(desc(sessions.lastSeenAt)),
    sessionCsrfToken(),
  ]);
  const currentDevice = deviceRows.find((device) => device.id === actor.deviceId);

  return (
    <PageShell title="Security" sub="Review enrolled devices and active sessions.">
      <div className="stack stack-5">
        <section className="stack stack-3">
          <h2 className="t-section">Enrolled devices</h2>
          {deviceRows.length === 0 ? <p className="t-small t-subtle">No active device records were found.</p> : deviceRows.map((device) => (
            <article className="card card-pad-md stack stack-2" key={device.id}>
              <div className="row row-between">
                <strong>{device.label}</strong>
                <span className="badge badge-plain">{device.id === actor.deviceId ? 'This device' : device.status}</span>
              </div>
              <span className="t-meta">{device.platform} · enrolled {relativeTime(device.enrolledAt)}</span>
              {device.lastSeenAt && <span className="t-meta">Last seen {relativeTime(device.lastSeenAt)}</span>}
            </article>
          ))}
        </section>
        <section className="stack stack-3">
          <div className="row row-between">
            <h2 className="t-section">Active sessions</h2>
            <span className="t-meta">{sessionRows.length} active</span>
          </div>
          {sessionRows.map((session) => (
            <article className="card card-pad-md stack stack-1" key={session.id}>
              <strong>{session.deviceId === actor.deviceId ? 'Current device session' : 'Other session'}</strong>
              <span className="t-meta">Last active {relativeTime(session.lastSeenAt ?? session.createdAt)} · expires {relativeTime(session.expiresAt)}</span>
            </article>
          ))}
          {sessionRows.some((session) => session.deviceId !== actor.deviceId) && (
            <form action={revokeOtherSessions}>
              <input type="hidden" name="__csrf" value={csrf} />
              <button className="btn btn-ghost btn-sm" type="submit">Sign out other sessions</button>
            </form>
          )}
        </section>
        <section className="card card-pad-lg stack stack-3">
          <h2 className="t-section">Move your account to a new device</h2>
          <p className="t-small t-subtle">Enyd Arch binds an account to one enrolled device. A transfer request is reviewed by Administration before a new device can be enrolled.</p>
          <form action={submitDeviceTransferRequest} className="stack stack-3">
            <input type="hidden" name="__csrf" value={csrf} />
            <label className="field">
              <span className="field-label">Reason</span>
              <select className="input" name="reason" required defaultValue="">
                <option value="" disabled>Select a reason</option>
                <option value="replacing_device">Replacing my device</option>
                <option value="lost_device">Lost device</option>
                <option value="stolen_device">Stolen device</option>
                <option value="damaged">Device damaged</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">New device label (optional)</span>
              <input className="input" name="newDeviceLabel" maxLength={80} placeholder="e.g. Personal laptop" />
            </label>
            <label className="field">
              <span className="field-label">Explanation</span>
              <textarea className="textarea-editor" name="explanation" rows={4} minLength={20} maxLength={2000} required />
            </label>
            <button className="btn btn-primary btn-sm" type="submit">Request device transfer</button>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
