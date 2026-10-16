'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePrivacySettings } from '~/server/actions/settings';

export interface SettingsInitial {
  profileVisibility: string;
  messagePolicy: string;
  theme: string;
  showActivity: boolean;
  showCreations: boolean;
  showArchiveContributions: boolean;
  discoverable: boolean;
  showRegion: boolean;
  connectionsEnabled: boolean;
  allowFriendRequests: boolean;
  hideAgeBand: boolean;
  reduceMotion: boolean;
  notifyOnMessage: boolean;
  notifyOnReply: boolean;
  notifyOnMention: boolean;
  notifyOnReaction: boolean;
  notifyOnConnection: boolean;
  notifyOnProject: boolean;
  notifyOnEvent: boolean;
  notifyOnFile: boolean;
  notifyOnModeration: boolean;
  notifyEmailDigest: boolean;
}

const privacyToggles: Array<[keyof SettingsInitial, string, string]> = [
  ['discoverable', 'Discoverable in member search', 'Turn this off to stay out of member discovery. Direct links still follow your profile visibility.'],
  ['showActivity', 'Show activity counts on your profile', 'Hide profile activity statistics from other members.'],
  ['showCreations', 'Show creative work counts', 'Hide creative-work activity from your profile summary.'],
  ['showArchiveContributions', 'Show Archive contributions', 'Hide Archive contribution counts from your profile summary.'],
  ['showRegion', 'Show my general region', 'Only a broad region is ever displayed; never put an exact address here.'],
  ['hideAgeBand', 'Hide my age band', 'Keep even the broad age band out of your public member summary.'],
  ['connectionsEnabled', 'Enable Connections', 'Turn off new connection discovery and requests.'],
  ['allowFriendRequests', 'Accept connection requests', 'Decline new requests when this is disabled.'],
  ['reduceMotion', 'Reduce motion', 'Prefer reduced animation and transitions.'],
];

const notificationToggles: Array<[keyof SettingsInitial, string]> = [
  ['notifyOnMessage', 'New messages'],
  ['notifyOnReply', 'Replies'],
  ['notifyOnMention', 'Mentions'],
  ['notifyOnReaction', 'Reactions'],
  ['notifyOnConnection', 'Connection activity'],
  ['notifyOnProject', 'Project activity'],
  ['notifyOnEvent', 'Event activity'],
  ['notifyOnFile', 'File activity'],
  ['notifyOnModeration', 'Moderation updates'],
  ['notifyEmailDigest', 'Email digest preference (requires configured email delivery)'],
];

export function SettingsForm({ csrf, initial }: { csrf: ReactNode; initial: SettingsInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await savePrivacySettings(null, data);
      if (!result.ok) {
        setError(result.message ?? 'Your settings could not be saved.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form className="stack stack-5" onSubmit={submit}>
      {csrf}
      <section className="panel panel-body stack stack-3">
        <h2 className="t-heading">Profile privacy</h2>
        <label className="field">
          <span className="field-label">Who can view my profile?</span>
          <select className="select" name="profileVisibility" defaultValue={initial.profileVisibility}>
            <option value="public">Public profile (within this app)</option>
            <option value="members">Signed-in members</option>
            <option value="connections">Accepted connections only</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Who can message me?</span>
          <select className="select" name="messagePolicy" defaultValue={initial.messagePolicy}>
            <option value="members">Signed-in members</option>
            <option value="nobody">Nobody</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Theme</span>
          <select className="select" name="theme" defaultValue={initial.theme}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <div className="stack stack-3">
          {privacyToggles.map(([key, label, description]) => (
            <label className="row row-3" key={key}>
              <input type="checkbox" name={key} defaultChecked={Boolean(initial[key])} />
              <span className="stack stack-1"><strong>{label}</strong><span className="t-meta">{description}</span></span>
            </label>
          ))}
        </div>
      </section>
      <section className="panel panel-body stack stack-3">
        <h2 className="t-heading">Notifications</h2>
        {notificationToggles.map(([key, label]) => (
          <label className="row row-3" key={key}>
            <input type="checkbox" name={key} defaultChecked={Boolean(initial[key])} />
            <span>{label}</span>
          </label>
        ))}
      </section>
      {error && <p className="t-danger" role="alert">{error}</p>}
      {saved && <p className="t-small" role="status">Settings saved.</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
