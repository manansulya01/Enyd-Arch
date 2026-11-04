import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { games } from '~db/schema';

/**
 * Issues a single-use play grant from the application to the sandbox host.
 *
 * The two processes share one secret; the sandbox will only hand out game bytes
 * for a game it can independently confirm is approved, and the grant names that
 * exact game. A grant is good for sixty seconds and can be spent once.
 */
export interface PlayGrant {
  ok: boolean;
  url?: string;
  reason?: string;
}

const GAME_ORIGIN = process.env.ARCH_GAME_ORIGIN ?? 'http://localhost:3101';
const SANDBOX_SECRET = process.env.SANDBOX_SECRET ?? '';

function runtimeConfigurationValid(): boolean {
  try {
    const app = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000');
    const game = new URL(GAME_ORIGIN);
    if (app.origin === game.origin) return false;
    if (process.env.NODE_ENV === 'production' && (app.protocol !== 'https:' || game.protocol !== 'https:')) return false;
    return SANDBOX_SECRET.length >= 32;
  } catch {
    return false;
  }
}

export async function mintPlayGrant(gameId: string): Promise<PlayGrant> {
  if (!runtimeConfigurationValid()) {
    return { ok: false, reason: 'The Arcade runtime requires a separate origin and a strong shared secret (HTTPS in production).' };
  }

  const [row] = await db
    .select({ id: games.id, packageChecksum: games.packageChecksum })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!row) return { ok: false, reason: 'That game is not available.' };

  try {
    const response = await fetch(`${GAME_ORIGIN}/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, secret: SANDBOX_SECRET }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) {
      return { ok: false, reason: 'The Arcade runtime is not reachable right now.' };
    }

    const payload = (await response.json()) as { grant?: string };
    if (!payload.grant) return { ok: false, reason: 'The Arcade runtime returned no grant.' };

    return { ok: true, url: `${GAME_ORIGIN}/play?grant=${encodeURIComponent(payload.grant)}` };
  } catch {
    return {
      ok: false,
      reason:
        'The Arcade runtime is offline. It runs as a separate origin so uploaded games never touch this application.',
    };
  }
}
