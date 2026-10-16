import type { NextConfig } from 'next';

const gameOrigin = process.env.ARCH_GAME_ORIGIN ?? 'http://localhost:3101';

/**
 * Security headers are applied globally. CSP is intentionally strict:
 * - games run from a separate sandboxed origin (see ARCH_GAME_ORIGIN)
 * - no third-party scripts, no framing of the app by anyone
 */
const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; hashes are not stable across builds
  // so we allow 'unsafe-inline' for styles/scripts only, and forbid remote sources.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // The Arcade embeds games served from the isolated game origin only.
  `frame-src 'self' ${gameOrigin}`,
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
      allowedOrigins: ['localhost:3000', '127.0.0.1:3000'],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
        ],
      },
      {
        // Immutable hashed asset storage
        source: '/objects/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, max-age=31536000, immutable' }],
      },
      {
        // Never cache the game sandbox bootstrap from a shared cache
        source: '/arcade/play/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, private' }],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/discord', destination: '/', permanent: false },
      { source: '/server/:s*', destination: '/network', permanent: false },
    ];
  },
};

export default nextConfig;