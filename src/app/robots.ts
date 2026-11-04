import type { MetadataRoute } from 'next';

/**
 * Enyd Arch is invitation-led. Robots directives reduce accidental indexing;
 * they are not access control and do not make a public repository or URL secret.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
    sitemap: undefined,
  };
}
