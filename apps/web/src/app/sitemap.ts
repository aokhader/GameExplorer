import type { MetadataRoute } from 'next';
import { GAME_LIST } from '@gameexplorer/shared';
import { SITE_URL } from '@/lib/site';

/**
 * Public content map for crawlers.
 *
 * The game entries are generated from `GAME_LIST` rather than typed out: a
 * hand-maintained route list is the same thing that left the tour saying
 * "Chess, checkers & reversi" two games after it stopped being true, and a
 * sitemap that silently omits the newest game is the version of that bug that
 * costs traffic.
 *
 * Only genuinely public, indexable pages are listed. Play surfaces
 * (`/{game}/bot`, `/local`, `/training`, `/puzzles`) are interactive app
 * routes with nothing to rank on, and the signed-in pages are disallowed in
 * `robots.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/licenses`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const gamePages: MetadataRoute.Sitemap = GAME_LIST.flatMap((game) => [
    {
      url: `${SITE_URL}/${game.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/${game.slug}/learn`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
  ]);

  return [...staticPages, ...gamePages];
}
