'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStory, removeStory, viewStory } from '~/server/actions/stories';

export type StoryItem = {
  id: string;
  body: string;
  audience: 'followers' | 'public';
  createdAt: string;
  expiresAt: string;
  authorId: string;
  username: string;
  displayName: string;
  isMine: boolean;
  viewCount: number;
};

function timestampLabel(value: string): string {
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export function StoriesFeed({ stories, csrfToken }: { stories: StoryItem[]; csrfToken: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'followers' | 'public'>('followers');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);

  async function publish() {
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await createStory({ body, audience, csrf: csrfToken });
      if (!result.ok) {
        setError(result.message ?? 'Your story could not be published.');
        return;
      }
      setBody('');
      setNotice('Your story is live for 24 hours.');
      router.refresh();
    } catch {
      setError('Your story could not be published. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function markViewed(storyId: string) {
    const result = await viewStory(storyId, csrfToken);
    if (!result.ok) {
      setError(result.message ?? 'This story is no longer available.');
      return;
    }
    setExpanded((current) => current.includes(storyId) ? current : [...current, storyId]);
    router.refresh();
  }

  async function remove(storyId: string) {
    setBusy(true); setError('');
    try {
      const result = await removeStory(storyId, csrfToken);
      if (!result.ok) setError(result.message ?? 'This story could not be removed.');
      else router.refresh();
    } catch {
      setError('This story could not be removed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack-4">
      <section className="panel panel-body stack stack-3" aria-labelledby="create-story-title">
        <h2 id="create-story-title">Share a moment</h2>
        <label className="field">
          <span className="field-label">Your story</span>
          <textarea className="input" rows={3} maxLength={600} value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="A thought, a small win, something you're working on…" />
          <span className="field-hint">{body.length}/600 characters · expires after 24 hours</span>
        </label>
        <label className="field">
          <span className="field-label">Audience</span>
          <select className="input" value={audience}
            onChange={(event) => setAudience(event.target.value as 'followers' | 'public')}>
            <option value="followers">People who follow me</option>
            <option value="public">All signed-in members</option>
          </select>
        </label>
        {error && <p className="notice notice-danger" role="alert">{error}</p>}
        {notice && <p className="notice notice-success" role="status">{notice}</p>}
        <div><button className="btn btn-primary" type="button" disabled={busy || !body.trim()} onClick={publish}>{busy ? 'Please wait…' : 'Publish story'}</button></div>
      </section>

      <section className="stack stack-3" aria-labelledby="stories-feed-title">
        <div className="row row-between"><h2 id="stories-feed-title">Recent stories</h2><span className="t-meta">{stories.length} shown</span></div>
        {stories.length === 0 ? (
          <div className="panel panel-body">
            <h3>No stories yet</h3>
            <p className="t-small t-muted">Follow members to see their updates, or share the first moment yourself.</p>
          </div>
        ) : stories.map((story) => (
          <article className="panel panel-body stack stack-2" key={story.id}>
            <div className="row row-between">
              <div>
                <strong>{story.displayName}</strong>
                <span className="t-meta"> · @{story.username} · {timestampLabel(story.createdAt)}</span>
                <p className="t-meta">{story.audience === 'public' ? 'All members' : 'Followers'} · expires {timestampLabel(story.expiresAt)}</p>
              </div>
              {story.isMine && <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => remove(story.id)}>Remove</button>}
            </div>
            <p className="story-body">{story.body}</p>
            {story.isMine ? (
              <p className="t-meta" aria-label="Story views">{story.viewCount} {story.viewCount === 1 ? 'view' : 'views'} · visible only to you</p>
            ) : (
              <div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => markViewed(story.id)} disabled={expanded.includes(story.id)}>
                  {expanded.includes(story.id) ? 'Viewed' : 'Mark as viewed'}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
