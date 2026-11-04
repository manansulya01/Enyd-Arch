'use client';

import { useState, useTransition } from 'react';
import { createCommunityInvite, revokeCommunityInvite } from '~/server/actions/communities';
import type { CommunityInviteView } from '~/server/actions/communities';

export function CommunityInviteManager({
  communityId,
  csrfToken,
  initialInvites,
}: {
  communityId: string;
  csrfToken: string;
  initialInvites: CommunityInviteView[];
}) {
  const [invites, setInvites] = useState(initialInvites);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setCreatedLink(null);
    startTransition(async () => {
      const result = await createCommunityInvite({
        communityId,
        expiresInHours: Number(expiresInHours),
        maxUses: Number(maxUses),
        csrf: csrfToken,
      });
      if (!result.ok || !result.data) {
        setMessage(result.message ?? 'Could not create an invite link.');
        return;
      }
      const invite = result.data;
      setInvites((current) => [{
        id: invite.inviteId,
        expiresAt: new Date(invite.expiresAt),
        maxUses: Number(maxUses),
        useCount: 0,
        revokedAt: null,
      }, ...current].slice(0, 30));
      setCreatedLink(`${window.location.origin}/communities/invite#${invite.token}`);
      setMessage('Invite created. Copy this link now; the secret is shown only once.');
    });
  }

  function revoke(inviteId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeCommunityInvite({ inviteId, csrf: csrfToken });
      if (!result.ok) {
        setMessage(result.message ?? 'Could not revoke that invite.');
        return;
      }
      setInvites((current) => current.map((invite) =>
        invite.id === inviteId ? { ...invite, revokedAt: new Date() } : invite,
      ));
      setMessage('Invite revoked.');
    });
  }

  async function copyLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setMessage('Invite link copied.');
    } catch {
      setMessage('Copy was blocked. Select and copy the invite URL manually.');
    }
  }

  return (
    <section className="panel panel-body stack stack-3" aria-label="Private community invite links">
      <h2>Private community invites</h2>
      <p className="t-small t-subtle">Invite secrets are stored only as SHA-256 hashes, shown once, expire automatically, and can be revoked by the owner.</p>
      <form className="row row-wrap" onSubmit={create}>
        <label className="field">
          <span className="field-label">Expires</span>
          <select className="input" value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)}>
            <option value="1">1 hour</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Maximum uses</span>
          <select className="input" value={maxUses} onChange={(event) => setMaxUses(event.target.value)}>
            <option value="1">1 person</option>
            <option value="5">5 people</option>
            <option value="25">25 people</option>
            <option value="100">100 people</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit" disabled={pending}>Create invite link</button>
      </form>
      {createdLink && (
        <div className="stack stack-2">
          <label className="field">
            <span className="field-label">One-time invite URL</span>
            <input className="input" readOnly value={createdLink} />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyLink()}>Copy invite link</button>
        </div>
      )}
      {message && <p className="t-small" role="status">{message}</p>}
      {invites.length > 0 && (
        <div className="stack stack-2">
          <h3>Recent links</h3>
          {invites.map((invite) => {
            const expired = invite.expiresAt.getTime() <= Date.now();
            const unavailable = Boolean(invite.revokedAt) || expired || invite.useCount >= invite.maxUses;
            return (
              <div className="row row-between row-wrap" key={invite.id}>
                <span className="t-small">
                  {invite.useCount}/{invite.maxUses} uses · expires {invite.expiresAt.toLocaleString()}
                  {invite.revokedAt ? ' · revoked' : expired ? ' · expired' : invite.useCount >= invite.maxUses ? ' · used up' : ' · active'}
                </span>
                {!unavailable && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => revoke(invite.id)}>Revoke</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
