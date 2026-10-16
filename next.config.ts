import type { NextConfig } from 'next';

const gameOrigin = process.env.ARCH_GAME_ORIGIN ?? 'http://localhost:3101';

/**
 * Security headers are applied globally. Games run from a separate origin;
 * framing is disabled except for the explicitly configured game origin.
 */
const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; styles are also emitted inline.
  // No third-party script or style origins are allowed.
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
  `frame-src 'self' ${gameOrigin}`,
  'upgrade-insecure-requests',
].join('; ');

const transportSecurityHeaders =
  process.env.NODE_ENV === 'production' && process.env.APP_ORIGIN?.startsWith('https://')
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ]
    : [];

const privateNoStore = [
  '/api/:path*',
  '/objects/:path*',
  '/files/:path*',
  '/home',
  '/messages/:path*',
  '/commons/:path*',
  '/archive/:path*',
  '/arcade/:path*',
  '/registry/:path*',
  '/network/:path*',
  '/exchange/:path*',
  '/projects/:path*',
  '/onboarding',
  '/settings/:path*',
  '/profile/:path*',
  '/notifications/:path*',
  '/connections/:path*',
  '/chronicle/:path*',
  '/gallery/:path*',
  '/events/:path*',
  '/cinema/:path*',
  '/inner-arch/:path*',
  '/me',
  '/watch/:path*',
  '/search/:path*',
  '/admin/:path*',
  '/sign-in',
  '/register',
];

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
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
          ...transportSecurityHeaders,
        ],
      },
      ...privateNoStore.map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
        ],
      })),
      {
        // Never cache the isolated game sandbox bootstrap.
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
