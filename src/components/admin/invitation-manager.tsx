'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createInvitationAction,
  revokeInvitationAction,
  type InvitationSummary,
} from '~/server/actions/admin';

type InvitationView = Omit<InvitationSummary, 'createdAt' | 'expiresAt' | 'revokedAt'> & {
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function InvitationManager({
  initialInvitations,
  csrfToken,
}: {
  initialInvitations: InvitationView[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [created, createAction, creating] = useActionState(createInvitationAction, null);
  const [revoked, revokeAction, revoking] = useActionState(revokeInvitationAction, null);

  useEffect(() => {
    if (created?.ok || revoked?.ok) router.refresh();
  }, [created, revoked, router]);

  return (
    <div className="stack-8">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Access control</p>
            <h2 className="section-title">Issue an invitation</h2>
          </div>
        </div>
        <p className="t-small t-muted">
          Codes are single-purpose entry passes. Share them privately; anyone who obtains a valid code may use one of its remaining places.
        </p>
        <form action={createAction} className="stack-3" style={{ marginTop: 'var(--sp-4)' }}>
          <input type="hidden" name="__csrf" value={csrfToken} />
          <label className="field">
            <span className="field-label">Invitation tier</span>
            <select className="input" name="tier" defaultValue="member">
              <option value="member">Member</option>
              <option value="inner_arch">Inner Arch</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Number of uses</span>
            <input className="input" type="number" name="maxUses" min={1} max={100} defaultValue={1} required />
          </label>
          <label className="field">
            <span className="field-label">Expires in days</span>
            <input className="input" type="number" name="expiresInDays" min={1} max={365} defaultValue={30} required />
          </label>
          <div>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create invitation'}
            </button>
          </div>
        </form>
        {created?.message && <p className={created.ok ? 'notice notice-success' : 'notice notice-danger'} role="status">{created.message}</p>}
        {created?.data?.code && (
          <div className="notice notice-success" role="status">
            <p className="field-label">Copy this new code now</p>
            <p className="invite-code">{created.data.code}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void navigator.clipboard?.writeText(created.data!.code)}>
              Copy code
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Invitation register</p>
            <h2 className="section-title">Issued codes</h2>
          </div>
          <span className="t-meta">{initialInvitations.length} shown</span>
        </div>
        {revoked?.message && <p className={revoked.ok ? 'notice notice-success' : 'notice notice-danger'} role="status">{revoked.message}</p>}
        {initialInvitations.length === 0 ? (
          <p className="t-small t-muted">No invitations have been issued yet. Create one above to admit the first member.</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Tier</th><th>Uses</th><th>Expires</th><th>Status</th><th /></tr></thead>
              <tbody>
                {initialInvitations.map((invite) => {
                  const expired = invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= Date.now();
                  const exhausted = invite.uses >= invite.maxUses;
                  const status = invite.revokedAt ? 'Revoked' : expired ? 'Expired' : exhausted ? 'Used up' : 'Active';
                  return (
                    <tr key={invite.id}>
                      <td><code>{invite.code}</code></td>
                      <td>{invite.tier === 'inner_arch' ? 'Inner Arch' : 'Member'}</td>
                      <td>{invite.uses} / {invite.maxUses}</td>
                      <td>{invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'Never'}</td>
                      <td>{status}</td>
                      <td>
                        {!invite.revokedAt && !expired && !exhausted && (
                          <form action={revokeAction}>
                            <input type="hidden" name="__csrf" value={csrfToken} />
                            <input type="hidden" name="invitationId" value={invite.id} />
                            <button className="btn btn-ghost" type="submit" disabled={revoking}>Revoke</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
