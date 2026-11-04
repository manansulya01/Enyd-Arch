// @ts-check
/**
 * The Arcade sandbox host.
 *
 * Member game code must never execute inside the application's origin, so in
 * development games run from a separate origin (default :3101). The app server
 * mints a single-use grant (POST /mint) naming one approved game; the grant
 * is exchanged once for a session-bound URL under which the game's files are
 * served.
 *
 *   pnpm dev:sandbox
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { readZip, entryExtension, GAME_LIMITS } from '../src/server/storage/zip.js';
import { decryptObject } from '../src/server/storage/envelope-core.js';

const PORT = Number(process.env.SANDBOX_PORT ?? 3101);
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const SHARED_SECRET = process.env.SANDBOX_SECRET ?? '';
const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? './storage');
const SANDBOX_ORIGIN = process.env.ARCH_GAME_ORIGIN ?? `http://localhost:${PORT}`;
try {
  const app = new URL(APP_ORIGIN);
  const game = new URL(SANDBOX_ORIGIN);
  if (app.origin === game.origin) throw new Error('The sandbox must use a separate origin from the application.');
  if (process.env.NODE_ENV === 'production' && (app.protocol !== 'https:' || game.protocol !== 'https:')) {
    throw new Error('Production application and sandbox origins must both use HTTPS.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid Arcade origin configuration.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to run the sandbox host.');
  process.exit(1);
}
if (!['local', 's3'].includes(process.env.STORAGE_DRIVER ?? 'local')) {
  console.error('STORAGE_DRIVER must be local or s3.');
  process.exit(1);
}
if ((process.env.STORAGE_DRIVER ?? 'local') === 's3' &&
    (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)) {
  console.error('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for the Arcade sandbox.');
  process.exit(1);
}
if (SHARED_SECRET.length < 32) {
  console.error('SANDBOX_SECRET must be configured with at least 32 characters.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && (!process.env.STORAGE_ENCRYPTION_KEY || process.env.STORAGE_ENCRYPTION_KEY.length < 32)) {
  console.error('STORAGE_ENCRYPTION_KEY must be configured for the sandbox in production.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 4, prepare: false });

const GRANT_TTL_MS = 60_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Single-use grants, held only long enough to be exchanged. */
const grants = new Map<string, { gameId: string; checksum: string | null; expiresAt: number }>();
const sessions = new Map<string, { gameId: string; objectKey: string; expiresAt: number }>();

function sign(value: string) {
  return createHmac('sha256', SHARED_SECRET).update(value).digest('base64url');
}

function mint(gameId: string, checksum: string | null) {
  const grant = sign(`${gameId}:${checksum ?? ''}:${randomBytes(32).toString('base64url')}`);
  grants.set(grant, { gameId, checksum, expiresAt: Date.now() + GRANT_TTL_MS });
  return grant;
}

function consumeGrant(grant: string) {
  const entry = grants.get(grant);
  grants.delete(grant);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
};

/**
 * The policy a game runs under. `connect-src 'none'` means a game cannot
 * beacon, phone home, or load anything the package does not contain.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  `frame-ancestors ${APP_ORIGIN}`,
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

async function readStoredObject(driver: string, objectKey: string): Promise<Uint8Array | null> {
  const segments = objectKey.split('/');
  if (!objectKey || objectKey.startsWith('/') || segments.some((part) => !part || part === '.' || part === '..' || part.includes('\\\\'))) {
    throw new Error('Invalid storage object key');
  }
  if (driver === 'local') {
    const absolute = path.resolve(STORAGE_ROOT, ...segments);
    if (!absolute.startsWith(STORAGE_ROOT + path.sep)) throw new Error('Invalid storage object key');
    try {
      return new Uint8Array(await readFile(absolute));
    } catch {
      return null;
    }
  }
  if (driver !== 's3') throw new Error('Unsupported storage driver');

  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION ?? 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT ?? `https://s3.${region}.amazonaws.com`;
  const accessKey = process.env.S3_ACCESS_KEY_ID!;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY!;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(endpoint).host;
  const canonicalUri = `/${[bucket, ...segments].map((part) => encodeURIComponent(part)).join('/')}`;
  const payloadHash = createHash('sha256').update(new Uint8Array()).digest('hex');
  const canonicalHeaders = `host:${host}\\nx-amz-content-sha256:${payloadHash}\\nx-amz-date:${amzDate}\\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['GET', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\\n');
  const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'GET',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Host: host,
    },
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`S3 object retrieval failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function send(res: ServerResponse, status: number, body: string | Uint8Array, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

function readBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += Buffer.byteLength(chunk);
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  // Expired in-memory grants and sessions are discarded on every request.
  const now = Date.now();
  for (const [key, value] of grants) if (value.expiresAt < now) grants.delete(key);
  for (const [key, value] of sessions) if (value.expiresAt < now) sessions.delete(key);

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Only the application origin may mint grants or embed games.
  const origin = req.headers.origin;
  if (origin && origin !== APP_ORIGIN) return send(res, 403, 'Forbidden');

  // ── Grant minting (app server only, shared-secret protected) ─────────
  if (req.method === 'POST' && url.pathname === '/mint') {
    let payload: { gameId?: string; secret?: string } = {};
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, 'Bad request');
    }
    const expected = Buffer.from(SHARED_SECRET);
    const presented = Buffer.from(String(payload.secret ?? ''));
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return send(res, 403, 'Forbidden');
    }
    const gameId = String(payload.gameId ?? '');
    if (!gameId) return send(res, 400, 'Missing gameId');

    const rows = await sql`
      select g.id, g.package_checksum from games g
      where g.id = ${gameId} and g.status = 'approved' and g.removed_at is null
      limit 1
    `;
    const game = rows[0];
    if (!game) return send(res, 404, 'Not approved');

    if (grants.size >= 10_000) return send(res, 429, 'Too many outstanding play grants');
    const grant = mint(gameId, game.package_checksum);
    return send(res, 200, JSON.stringify({ grant }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  }

  // ── Entry redirect: /play?grant=... → /s/<session>/<entry> ───────────
  if (url.pathname === '/play' || url.pathname === '/') {
    const grant = url.searchParams.get('grant');
    if (!grant) return send(res, 404, 'Not found');

    const entry = consumeGrant(grant);
    if (!entry) return send(res, 403, 'Invalid or expired grant');

    const rows = await sql`
      select g.id, g.title, g.entry_file, g.package_checksum,
             o.object_key, o.driver as storage_driver, o.checksum as storage_checksum, o.byte_size as storage_byte_size
      from games g
      join storage_objects o on o.id = g.package_object_id
      where g.id = ${entry.gameId}
        and g.status = 'approved'
        and g.removed_at is null
        and o.removed_at is null
      limit 1
    `;
    const game = rows[0];
    if (!game) return send(res, 404, 'Game not approved');
    if (entry.checksum && game.package_checksum && entry.checksum !== game.package_checksum) {
      return send(res, 409, 'Package changed');
    }

    if (sessions.size >= 50_000) return send(res, 429, 'Arcade runtime is at capacity');
    const session = randomBytes(24).toString('base64url');
    sessions.set(session, {
      gameId: game.id,
      objectKey: game.object_key,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    res.writeHead(302, { Location: `/s/${session}/${game.entry_file ?? 'index.html'}` });
    return res.end();
  }

  // ── Serving a game: /s/<session>/<path> ───────────────────────────────
  const sessionMatch = /^\/s\/([^/]+)\/(.*)$/.exec(url.pathname);
  if (!sessionMatch) return send(res, 404, 'Not found');

  const session = sessions.get(sessionMatch[1]!);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionMatch[1]!);
    return send(res, 403, 'Session expired — relaunch the game');
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;

  let wanted: string;
  try {
    wanted = decodeURIComponent(sessionMatch[2]! || 'index.html');
  } catch {
    return send(res, 400, 'Bad path');
  }
  if (wanted.includes('..')) return send(res, 400, 'Bad path');

  let entries: ReturnType<typeof readZip>;
  try {
    const storedBytes = await readStoredObject(String(game.storage_driver), String(game.object_key));
    if (!storedBytes) return send(res, 404, 'Package unavailable');
    const decoded = decryptObject(storedBytes);
    const actualChecksum = createHash('sha256').update(decoded.data).digest('hex');
    if (
      decoded.data.byteLength !== Number(game.storage_byte_size) ||
      actualChecksum !== String(game.storage_checksum) ||
      (game.package_checksum && actualChecksum !== String(game.package_checksum))
    ) {
      return send(res, 409, 'Package integrity check failed');
    }
    entries = readZip(decoded.data, GAME_LIMITS);
  } catch {
    return send(res, 404, 'Package unavailable');
  }

  const file = entries.find((candidate) => candidate.path === wanted);
  if (!file) return send(res, 404, 'Not found');
  return send(res, 200, file.data, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[entryExtension(file.path)] ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=60',
  });
});

server.listen(PORT, () => {
  console.log(`Enyd Arch sandbox host on http://localhost:${PORT}`);
  console.log(`Embedding origin: ${APP_ORIGIN}`);
});

process.on('SIGINT', () => {
  void sql.end();
  process.exit(0);
});
