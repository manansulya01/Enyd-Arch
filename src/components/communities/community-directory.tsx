'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCommunity, joinCommunity, leaveCommunity } from '~/server/actions/communities';

export type CommunitySummary = { id: string; slug: string; name: string; description: string; memberCount: number };

export function CommunityDirectory({ communities, joinedIds, csrfToken }: {
  communities: CommunitySummary[];
  joinedIds: string[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  async function create() {
    setBusyId('create'); setMessage('');
    try {
      const result = await createCommunity({ name, description, csrf: csrfToken });
      if (!result.ok || !result.data) { setMessage(result.message ?? 'Could not create community.'); return; }
      router.push(`/communities/${result.data.slug}`);
      router.refresh();
    } catch { setMessage('Could not create community. Please try again.'); }
    finally { setBusyId(''); }
  }

  async function toggle(community: CommunitySummary, joined: boolean) {
    setBusyId(community.id); setMessage('');
    try {
      const result = joined
        ? await leaveCommunity(community.id, csrfToken)
        : await joinCommunity(community.id, csrfToken);
      if (!result.ok) { setMessage(result.message ?? 'Could not update membership.'); return; }
      router.refresh();
    } catch { setMessage('Could not update community membership. Please try again.'); }
    finally { setBusyId(''); }
  }

  return <div className="stack stack-4">
    <section className="panel panel-body stack stack-3">
      <h2>Create a community</h2>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="Open-source builders" />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="input" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="What is this community about?" />
      </label>
      <button className="btn btn-primary" type="button" disabled={busyId !== '' || name.trim().length < 3} onClick={() => void create()}>Create community</button>
      <p className="t-meta">Communities are public for now. The creator becomes the owner.</p>
    </section>
    <section className="stack stack-3">
      <h2>Discover communities</h2>
      {communities.length === 0 ? <p className="t-small t-muted">No communities yet. Start one.</p> : communities.map(community => {
        const joined = joinedIds.includes(community.id);
        return <article className="panel panel-body stack stack-2" key={community.id}>
          <div className="row row-between">
            <div className="stack stack-1">
              <h3><a className="lnk" href={`/communities/${community.slug}`}>{community.name}</a></h3>
              <p className="t-meta">{community.memberCount} members</p>
            </div>
            <button className={joined ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm'} type="button" disabled={busyId !== ''} onClick={() => void toggle(community, joined)}>
              {busyId === community.id ? '…' : joined ? 'Leave' : 'Join'}
            </button>
          </div>
          {community.description && <p className="t-small">{community.description}</p>}
        </article>;
      })}
    </section>
    {message && <p className="t-small" role="status">{message}</p>}
  </div>;
}
