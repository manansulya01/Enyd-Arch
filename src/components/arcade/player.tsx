'use client';

import { useEffect, useRef, useState } from 'react';
import { onRecordPlay } from '~/server/actions/arcade-client';

/**
 * The player.
 *
 * The game is embedded from the isolated game origin with a restrictive
 * `sandbox` attribute as a second line of defence: even if that origin were
 * misconfigured, the frame cannot reach this document's cookies or DOM. A play
 * is recorded once per mount, when the frame has been up for a few seconds.
 */
export function GamePlayer({
  gameId,
  title,
  grantUrl,
  grantError,
}: {
  gameId: string;
  title: string;
  grantUrl: string | null;
  grantError: string | null;
}) {
  const [launched, setLaunched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorded = useRef(false);

  useEffect(() => {
    if (!launched) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [launched]);

  useEffect(() => {
    if (!launched || recorded.current || elapsed < 3) return;
    recorded.current = true;
    void onRecordPlay(gameId, elapsed);
  }, [elapsed, gameId, launched]);

  if (!grantUrl) {
    return (
      <section className="sandbox" aria-label="Game runtime">
        <div className="sandbox-bar">
          <span className="t-meta">Arcade runtime</span>
        </div>
        <div className="sandbox-overlay">
          <p className="gate-title">{grantError ?? 'This game cannot be launched yet.'}</p>
          <p className="gate-body">
            Games are served from a separate origin so uploaded code can never touch your session.
            If this persists, the runtime host is not running.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="sandbox" aria-label={`${title} — game`}>
      <div className="sandbox-bar">
        <span className="t-meta">
          Running in an isolated sandbox · {formatSeconds(elapsed)}
        </span>
        <div className="row row-2" style={{ marginInlineStart: 'auto' }}>
          <span className="badge badge-plain" title="This frame cannot reach the Enyd Arch application">
            sandboxed
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLaunched(false);
              setElapsed(0);
              recorded.current = false;
            }}
          >
            Close
          </button>
        </div>
      </div>

      {launched ? (
        <iframe
          className="sandbox-frame"
          src={grantUrl}
          title={`${title} (sandboxed game)`}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          allow="autoplay; fullscreen"
        />
      ) : (
        <div className="sandbox-overlay">
          <span className="gate-glyph" aria-hidden="true">
            ◱
          </span>
          <p className="gate-title">Ready to play</p>
          <p className="gate-body">
            The game loads from a separate origin with no access to your account, cookies, or this
            site&apos;s data.
          </p>
          <button className="btn btn-primary" onClick={() => setLaunched(true)}>
            Launch {title}
          </button>
        </div>
      )}

      <p className="sandbox-isolation t-meta">
        The frame above runs on a different origin, cannot make network requests, and cannot read
        anything about your Enyd identity. You can close it at any time.
      </p>
    </section>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
