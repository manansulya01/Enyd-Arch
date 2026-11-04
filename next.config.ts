import type { NextConfig } from 'next';

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
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'Origin-Agent-Cluster', value: '?1' },
    ];

    // HSTS is emitted only for production deployments, where HTTPS must be
    // terminated correctly. Do not enable it for local HTTP development.
    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }

    return [
      { source: '/:path*', headers },
      {
        // Public object URLs are still authorization-checked by the handler.
        // Avoid shared caches; authorization can be revoked at any time.
        source: '/objects/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
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
