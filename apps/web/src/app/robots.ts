import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Crawler policy. Added alongside `sitemap.ts` to give the product a search
 * identity it had none of.
 *
 * The disallowed paths are the ones that are either per-user or meaningless to
 * index: signed-in surfaces, the auth callback, and the account-deletion flow.
 * Everything else — the landing page, the game hubs and the tutorials — is
 * public content we want found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/auth/', '/profile', '/settings', '/delete-account', '/spectate/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
