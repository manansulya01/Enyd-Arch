'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { reviewGame } from '~/server/actions/admin';

export type GameReviewItem = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  slug: string;
  creatorName: string;
  creatorUsername: string;
  createdAt: string;
  findings: Array<{ rule: string; detail: string; severity: string }>;
};

type Decision = 'approved' | 'rejected' | 'changes_requested';

export function GameReviewQueue({
  initialGames,
  csrfToken,
}: {
  initialGames: GameReviewItem[];
  csrfToken: string;
}) {
  const [games, setGames] = useState(initialGames);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(gameId: string, decision: Decision) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await reviewGame(gameId, decision, notes[gameId] ?? '', csrfToken);
        if (!result.ok) {
          setMessage(result.message ?? 'The game review could not be saved.');
          return;
        }
        setGames((current) => current.filter((game) => game.id !== gameId));
        setMessage(decision === 'approved' ? 'Game approved and published.' : decision === 'rejected' ? 'Game rejected.' : 'Changes requested.');
      } catch {
        setMessage('The game review could not be saved. Reload and try again.');
      }
    });
  }

  return (
    <section className="panel panel-body stack stack-3" aria-label="Arcade game review queue">
      <div className="row row-between row-wrap">
        <h2>Arcade submissions</h2>
        <span className="t-meta">{games.length} awaiting review</span>
      </div>
      <p className="t-small t-subtle">Packages that pass automated scanning remain unplayable until a reviewer approves them. Review scanner findings before publishing.</p>
      {games.length === 0 ? (
        <p className="t-small">No Arcade submissions are awaiting review.</p>
      ) : games.map((game) => (
        <article className="card-pad stack stack-2" key={game.id}>
          <div className="row row-between row-wrap">
            <strong>{game.title}</strong>
            <span className="t-meta">{new Date(game.createdAt).toLocaleString()}</span>
          </div>
          <p className="t-small">{game.tagline}</p>
          {game.description && <p className="prose">{game.description}</p>}
          <p><Link className="lnk" href={`/arcade/${game.slug}`}>Inspect submission details</Link></p>
          <p className="t-meta">Submitted by {game.creatorName} (@{game.creatorUsername})</p>
          {game.findings.length > 0 ? (
            <div className="notice notice-info stack stack-1">
              <strong className="t-small">Automated scan findings</strong>
              {game.findings.map((finding, index) => (
                <p className="t-small" key={`${finding.rule}:${index}`}>
                  <strong>{finding.severity}</strong> · {finding.rule}: {finding.detail}
                </p>
              ))}
            </div>
          ) : (
            <p className="t-small t-subtle">No automated scanner findings were recorded.</p>
          )}
          <label className="field">
            <span className="field-label">Reviewer note (optional)</span>
            <textarea
              className="textarea-editor"
              rows={2}
              maxLength={1000}
              value={notes[game.id] ?? ''}
              onChange={(event) => setNotes((current) => ({ ...current, [game.id]: event.target.value }))}
            />
          </label>
          <div className="row row-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => decide(game.id, 'approved')}>Approve and publish</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => decide(game.id, 'changes_requested')}>Request changes</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => decide(game.id, 'rejected')}>Reject</button>
          </div>
        </article>
      ))}
      {message && <p className="t-small" role="status">{message}</p>}
    </section>
  );
}
