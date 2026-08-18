/**
 * The canonical public origin of the web app.
 *
 * Lives here rather than in `layout.tsx` because `robots.ts` and `sitemap.ts`
 * are separate route handlers that need the same value — and a sitemap that
 * advertises a different host than `metadataBase` is worse than no sitemap.
 *
 * Overridable so preview deploys advertise themselves rather than production.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://game-explorer-site.vercel.app';
