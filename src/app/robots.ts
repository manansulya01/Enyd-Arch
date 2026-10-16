import type { MetadataRoute } from 'next';

/**
 * This is crawler guidance, not an access-control mechanism. Authentication
 * and server-side authorisation must protect private content independently.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
