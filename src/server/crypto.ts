import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Single source of truth for the installation secret.
 *
 * The secret is validated at boot in production. In development a fixed value
 * keeps sessions valid across restarts; it is loudly marked as insecure.
 */
function readSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (isProd) {
      throw new Error(
        'AUTH_SECRET must be set to at least 32 characters in production. Generate one with: openssl rand -base64 48',
      );
    }
    return 'enyd-arch-development-secret-not-for-production-use';
  }
  return secret;
}

export const AUTH_SECRET = readSecret();

/** Namespaced HMAC so the same secret can derive several independent keys. */
export function deriveKey(purpose: string, length = 32): Buffer {
  return createHmac('sha256', AUTH_SECRET).update(`enyd:${purpose}:v1`).digest().subarray(0, length);
}

// ── Random values ─────────────────────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomHex(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

/** Human-friendly invitation code. Ambiguous glyphs removed. */
export function invitationCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export function numericCode(length = 6): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += String(randomInt(10));
  }
  return out;
}

// ── Hashing ───────────────────────────────────────────────────────────────

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacHex(purpose: string, value: string): string {
  return createHmac('sha256', deriveKey(purpose)).update(value).digest('hex');
}

/** Constant-time comparison for equal-length secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// ═══════════════════════════════════════════════════════════════════════════
// Device fingerprinting
//
// Privacy position: the fingerprint is a keyed hash of coarse, already-public
// browser characteristics (user agent family, screen class, language, timezone
// bucket). It is never sent to a third party, never shown to other members, and
// cannot be reversed to recover the inputs. It exists so a session cannot be
// lifted onto a different browser profile — it is not a tracking identifier.
// ═══════════════════════════════════════════════════════════════════════════

export interface DeviceTraits {
  userAgent: string;
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  hardwareConcurrency: number;
  colorDepth: number;
}

const screenBucket = (width: number, height: number): string => {
  const longest = Math.max(width, height);
  const shortest = Math.min(width, height);
  if (longest >= 2400) return 'xl';
  if (longest >= 1800) return 'lg';
  if (longest >= 1280) return 'md';
  if (longest >= 900) return 'sm';
  return 'xs';
};

const timezoneBucket = (timezone: string): string => {
  try {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return offset.replace(/\s/g, '');
  } catch {
    return 'unknown';
  }
};

export function deviceFingerprint(traits: DeviceTraits): string {
  const material = [
    traits.userAgent.slice(0, 180),
    (traits.language || 'und').slice(0, 12),
    timezoneBucket(traits.timezone),
    screenBucket(traits.screenWidth, traits.screenHeight),
    String(traits.hardwareConcurrency || 0),
    String(traits.colorDepth || 0),
  ].join('|');
  return hmacHex('device-fingerprint', material);
}

export function platformLabel(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) return 'iOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown device';
}

export function browserLabel(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Browser';
}

// ═══════════════════════════════════════════════════════════════════════════
// Request identity
// ═══════════════════════════════════════════════════════════════════════════

const TRUSTED_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 0);

/**
 * Resolves the client address for abuse controls and audit records.
 * Proxy headers are only honoured when explicitly configured, otherwise a
 * client could trivially spoof its own address.
 */
export function clientIp(forwardedFor?: string | null): string {
  if (TRUSTED_HOPS > 0 && forwardedFor) {
    const parts = forwardedFor.split(',').map((part) => part.trim());
    const index = Math.max(0, parts.length - TRUSTED_HOPS);
    const chosen = parts[index];
    if (chosen) return chosen;
  }
  return 'local';
}

/**
 * Privacy-preserving identifier for security logs. The raw address is never
 * persisted; only a keyed hash survives, which is enough to correlate events
 * from one device without retaining the address itself.
 */
export function ipPseudonym(ip: string): string {
  return hmacHex('ip-pseudonym', ip).slice(0, 32);
}

export async function requestTraits(): Promise<{
  ip: string;
  ipHash: string;
  userAgent: string;
  origin: string;
  traits: DeviceTraits;
  fingerprint: string;
}> {
  const headerList = await headers();
  const userAgent = headerList.get('user-agent') ?? 'unknown';
  const ip = clientIp(headerList.get('x-forwarded-for'));
  const forwardedHost = headerList.get('x-forwarded-host');
  const host = forwardedHost ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (isProd ? 'https' : 'http');
  const origin = `${protocol}://${host}`;

  // The browser supplies its coarse traits through a cookie set once at boot.
  const cookieStore = await cookies();
  const encoded = cookieStore.get('enyd_device_traits')?.value;
  let traits: DeviceTraits = {
    userAgent,
    language: '',
    timezone: '',
    screenWidth: 0,
    screenHeight: 0,
    hardwareConcurrency: 0,
    colorDepth: 0,
  };

  if (encoded) {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<
        DeviceTraits
      >;
      traits = {
        userAgent: parsed.userAgent?.slice(0, 180) ?? userAgent,
        language: String(parsed.language ?? '').slice(0, 12),
        timezone: String(parsed.timezone ?? '').slice(0, 64),
        screenWidth: Number(parsed.screenWidth ?? 0) || 0,
        screenHeight: Number(parsed.screenHeight ?? 0) || 0,
        hardwareConcurrency: Number(parsed.hardwareConcurrency ?? 0) || 0,
        colorDepth: Number(parsed.colorDepth ?? 0) || 0,
      };
    } catch {
      /* corrupt cookie: fall back to server-derived traits */
    }
  }

  return {
    ip,
    ipHash: ipPseudonym(ip),
    userAgent,
    origin,
    traits,
    fingerprint: deviceFingerprint(traits),
  };
}

export function base64url(buffer: Uint8Array | Buffer): string {
  return Buffer.from(buffer).toString('base64url');
}

export function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}