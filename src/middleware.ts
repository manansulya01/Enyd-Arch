import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function trustedGameOrigin(): string {
  const configured = process.env.ARCH_GAME_ORIGIN ?? 'http://localhost:3101';
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return 'http://localhost:3101';
    }
    return parsed.origin;
  } catch {
    return 'http://localhost:3101';
  }
}

function createNonce(): string {
  // Middleware runs in the Edge runtime by default; use Web Crypto rather than
  // importing Node-only crypto APIs.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Per-response CSP nonce. Next.js reads the CSP from the forwarded request and
 * applies the nonce to its own inline bootstrap scripts, so the application
 * does not need the dangerous script-src 'unsafe-inline' exception.
 *
 * This is defense in depth, not a replacement for output encoding or safe
 * handling of member-generated content.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const gameOrigin = trustedGameOrigin();
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(process.env.NODE_ENV !== 'production' ? ["'unsafe-eval'"] : []),
  ].join(' ');
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `frame-src 'self' ${gameOrigin}`,
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ];
  const csp = directives.join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  // Member pages and API responses can contain private conversations, profile
  // data, and invitation material. Never let a shared cache retain them.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|mark.svg|robots.txt).*)',
  ],
};
