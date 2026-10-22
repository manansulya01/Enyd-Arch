'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONNECTION_INTERESTS,
  INTEREST_GROUPS,
  INTEREST_LABELS,
  MARK,
  titleCase,
} from '~/lib/domain';
import type { OnboardingContext } from '~/server/onboarding-context';
import {
  onCompleteOnboarding,
  onSaveConnections,
  onSaveIdentity,
  onSaveInterests,
  onSavePrivacy,
  onSaveProfileDetail,
} from '~/server/actions/onboarding-client';

/**
 * The introduction. Nine beats, each one saving as it goes, so closing the tab
 * mid-way resumes rather than restarts. Nothing here is required beyond a
 * display name — everything else has a sensible default.
 */
export function OnboardingWizard({
  identity,
  context,
  csrfToken,
}: {
  csrfToken: string;
  identity: { username: string; displayName: string; memberId: string; isMinor: boolean; ageBand: string };
  context: OnboardingContext;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState(context.profile.displayName || identity.displayName);
  const [headline, setHeadline] = useState(context.profile.headline ?? '');
  const [pronouns, setPronouns] = useState(context.profile.pronouns ?? '');
  const [institution, setInstitution] = useState(context.profile.institution ?? '');
  const [fieldOfStudy, setFieldOfStudy] = useState(context.profile.fieldOfStudy ?? '');
  const [region, setRegion] = useState(context.profile.region ?? '');

  const [interests, setInterests] = useState<string[]>(context.interests);
  const [bio, setBio] = useState(context.profile.bio ?? '');
  const [skillsRaw, setSkillsRaw] = useState(context.profile.skills.map((skill) => skill.label).join(', '));

  const [profileVisibility, setProfileVisibility] = useState(context.settings.profileVisibility);
  const [discoverable, setDiscoverable] = useState(context.settings.discoverable);
  const [messagePolicy, setMessagePolicy] = useState(context.settings.messagePolicy);

  const [connectionsEnabled, setConnectionsEnabled] = useState(context.connections.enabled);
  const [friendshipOptIn, setFriendshipOptIn] = useState(context.connections.friendshipOptIn);
  const [collaborationOptIn, setCollaborationOptIn] = useState(context.connections.collaborationOptIn);
  const [datingOptIn, setDatingOptIn] = useState(context.connections.datingOptIn);
  const [connectionInterests, setConnectionInterests] = useState<string[]>(context.connections.interests);

  const STEPS = [
    'Your name',
    'Interests',
    'About you',
    'Privacy',
    'Connections',
    'The door',
  ];

  async function next() {
    setError(null);
    setSaving(true);
    try {
      if (step === 0) {
        const result = await onSaveIdentity({
          displayName,
          headline,
          pronouns,
          institution,
          fieldOfStudy,
          region,
          avatarGlyph: '◈',
          avatarHue: 40,
        }, csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
      } else if (step === 1) {
        if (interests.length < 3) return setError('Choose at least three interests.');
        const result = await onSaveInterests(interests, csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
      } else if (step === 2) {
        const skills = skillsRaw
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label) => ({ key: label.toLowerCase().replace(/\s+/g, '-'), label }));
        const result = await onSaveProfileDetail({ bio, skills, links: [] }, csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
      } else if (step === 3) {
        const result = await onSavePrivacy({
          profileVisibility,
          discoverable,
          showRegion: Boolean(region),
          messagePolicy,
        }, csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
      } else if (step === 4) {
        const result = await onSaveConnections({
          enabled: connectionsEnabled,
          friendshipOptIn,
          collaborationOptIn,
          datingOptIn: identity.isMinor ? false : datingOptIn,
          showInDating: identity.isMinor ? false : datingOptIn,
          datingIntent: '',
          interests: connectionInterests,
        }, csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
      } else if (step === 5) {
        const result = await onCompleteOnboarding(csrfToken);
        if (!result.ok) return setError(result.message ?? 'Could not save.');
        router.push('/home');
        return;
      }
      setStep((current) => current + 1);
    } finally {
      setSaving(false);
    }
  }

  function toggleInterest(key: string) {
    setInterests((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  function toggleConnectionInterest(label: string) {
    setConnectionInterests((current) =>
      current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label],
    );
  }

  return (
    <div className="onboard-step">
      <div className="onboard-progress" aria-hidden="true">
        {STEPS.map((title, index) => (
          <span
            key={title}
            className={`onboard-step-dot${index === step ? ' is-current' : index < step ? ' is-done' : ''}`}
          />
        ))}
      </div>

      <p className="onboard-step-index t-meta">
        {step + 1} / {STEPS.length}
      </p>
      <h1 className="onboard-step-title">
        {step === 0 && 'What should we call you?'}
        {step === 1 && 'What pulls you in?'}
        {step === 2 && 'Anything more?'}
        {step === 3 && 'How visible are you?'}
        {step === 4 && 'Who do you want to meet?'}
        {step === 5 && 'The door is open.'}
      </h1>
      <p className="onboard-step-sub t-muted">
        {step === 0 && 'Your display name is what members see. You can change it later.'}
        {step === 1 && 'Used for discovery, never shown to advertisers. Pick what you actually like.'}
        {step === 2 && 'A short bio, a few skills. Both optional, both editable anytime.'}
        {step === 3 && 'Sane defaults are chosen. Privacy settings can be tightened whenever.'}
        {step === 4 &&
          'Connections is opt-in, per mode. Dating is only available to adult members and is off by default.'}
        {step === 5 && `Your identity is ${identity.memberId}. Enter when you are ready.`}
      </p>

      {error && (
        <p className="notice notice-danger" role="alert">
          <span className="notice-glyph" aria-hidden="true">
            !
          </span>
          <span className="notice-body">{error}</span>
        </p>
      )}

      {step === 0 && (
        <div className="stack stack-4">
          <label className="field">
            <span className="field-label">Display name</span>
            <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={48} />
          </label>
          <label className="field">
            <span className="field-label">Headline</span>
            <input className="input" value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} placeholder="e.g. Illustration, quiet rooms, good playlists" />
          </label>
          <div className="row row-2">
            <label className="field">
              <span className="field-label">Pronouns</span>
              <input className="input" value={pronouns} onChange={(event) => setPronouns(event.target.value)} maxLength={24} />
            </label>
            <label className="field">
              <span className="field-label">Institution</span>
              <input className="input" value={institution} onChange={(event) => setInstitution(event.target.value)} maxLength={120} />
            </label>
          </div>
          <div className="row row-2">
            <label className="field">
              <span className="field-label">Field of study</span>
              <input className="input" value={fieldOfStudy} onChange={(event) => setFieldOfStudy(event.target.value)} maxLength={120} />
            </label>
            <label className="field">
              <span className="field-label">Region (optional)</span>
              <input className="input" value={region} onChange={(event) => setRegion(event.target.value)} maxLength={64} placeholder="e.g. Mumbai region" />
            </label>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="interest-groups">
          {INTEREST_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="interest-group-label">{group.group}</p>
              <div className="interest-grid">
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={`interest-chip${interests.includes(item) ? ' is-selected' : ''}`}
                    aria-pressed={interests.includes(item)}
                    onClick={() => toggleInterest(item)}
                  >
                    {INTEREST_LABELS[item] ?? titleCase(item)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="stack stack-4">
          <label className="field">
            <span className="field-label">Bio</span>
            <textarea className="textarea" rows={5} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={1200} />
          </label>
          <label className="field">
            <span className="field-label">Skills, comma separated</span>
            <input className="input" value={skillsRaw} onChange={(event) => setSkillsRaw(event.target.value)} placeholder="writing, figma, darkroom" />
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="stack stack-4">
          <label className="field">
            <span className="field-label">Profile visibility</span>
            <select className="select" value={profileVisibility} onChange={(event) => setProfileVisibility(event.target.value as typeof profileVisibility)}>
              <option value="members">Members only</option>
              <option value="connections">Connections only</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Who can message you</span>
            <select className="select" value={messagePolicy} onChange={(event) => setMessagePolicy(event.target.value as typeof messagePolicy)}>
              <option value="members">Members</option>
              <option value="connections">Connections</option>
              <option value="everyone">Everyone</option>
              <option value="nobody">No one</option>
            </select>
          </label>
          <label className="setting-row">
            <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} />
            <span className="switch-text">
              <span className="switch-title">Discoverable in the Network</span>
              <span className="switch-desc">Members with shared interests can find you.</span>
            </span>
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="stack stack-4">
          <label className="setting-row">
            <input type="checkbox" checked={connectionsEnabled} onChange={(event) => setConnectionsEnabled(event.target.checked)} />
            <span className="switch-text">
              <span className="switch-title">Open Connections for me</span>
              <span className="switch-desc">Master switch. Each mode is still opt-in below.</span>
            </span>
          </label>
          {connectionsEnabled && (
            <>
              <label className="setting-row">
                <input type="checkbox" checked={friendshipOptIn} onChange={(event) => setFriendshipOptIn(event.target.checked)} />
                <span className="switch-text">
                  <span className="switch-title">Friendship</span>
                </span>
              </label>
              <label className="setting-row">
                <input type="checkbox" checked={collaborationOptIn} onChange={(event) => setCollaborationOptIn(event.target.checked)} />
                <span className="switch-text">
                  <span className="switch-title">Collaboration</span>
                </span>
              </label>
              {!identity.isMinor && (
                <label className="setting-row">
                  <input type="checkbox" checked={datingOptIn} onChange={(event) => setDatingOptIn(event.target.checked)} />
                  <span className="switch-text">
                    <span className="switch-title">Dating</span>
                    <span className="switch-desc">Age-appropriate romantic connections. Adults only.</span>
                  </span>
                </label>
              )}
              <p className="field-label">What you want to find</p>
              <div className="interest-grid">
                {CONNECTION_INTERESTS.filter(
                  (entry) =>
                    (entry.mode === 'friendship' && friendshipOptIn) ||
                    (entry.mode === 'collaboration' && collaborationOptIn) ||
                    (entry.mode === 'dating' && datingOptIn && !identity.isMinor),
                ).map((entry) => (
                  <button
                    type="button"
                    key={entry.key}
                    className={`interest-chip${connectionInterests.includes(entry.label) ? ' is-selected' : ''}`}
                    aria-pressed={connectionInterests.includes(entry.label)}
                    onClick={() => toggleConnectionInterest(entry.label)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="centered-page">
          <span className="gate-glyph" aria-hidden="true">{MARK}</span>
          <p className="t-lede">
            Welcome, {displayName}. The Commons is waiting, and the Archive is already full of
            things worth finding.
          </p>
        </div>
      )}

      <div className="onboard-actions">
        {step > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setStep((current) => current - 1)} disabled={saving}>
            Back
          </button>
        )}
        <button type="button" className="btn btn-primary btn-mark" onClick={next} disabled={saving}>
          {step === 5 ? 'Enter the Commons' : saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
