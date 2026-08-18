'use client';

import { usePathname } from 'next/navigation';
import { GAME_LIST } from '@gameexplorer/shared';
import { AmbientBackground, type AmbientHue } from './AmbientBackground';

/**
 * Single app-wide ambient backdrop, mounted once in the root layout. Derives the
 * glow hue + intensity from the current route so every page gets the right
 * backdrop with no per-page wiring (and no stacked layers):
 *   - home / a game landing → that game's hue, bold + animated aurora (heroes);
 *   - deep gameplay (play/bot/training/analysis/spectated game) → subtle, static
 *     (the board stays the focal point — no motion behind active play);
 *   - everything else → default brand glow, static.
 */
export function RouteAmbient() {
  const pathname = usePathname() || '/';
  const seg = pathname.split('/')[1] ?? '';

  // Matched against the catalog by SLUG, since that is what a route segment
  // actually is, and read back as `accent`. The hand-written list this replaced
  // named only the first three games, so `/go` and `/liquidate` were still
  // getting the brand gold on their own hubs long after both shipped — and, via
  // isHeroRoute below, a flat backdrop where the other three got the aurora.
  const entry = GAME_LIST.find((g) => g.slug === seg) ?? null;
  const hue: AmbientHue = entry?.accent ?? 'brand';

  const isHeroRoute = pathname === '/' || (entry !== null && pathname === `/${entry.slug}`);
  const isDeepGame =
    /\/(play|bot|training|analysis)(\/|$)/.test(pathname) || pathname.startsWith('/spectate/');

  const intensity = isHeroRoute ? 'bold' : isDeepGame ? 'subtle' : 'default';

  return <AmbientBackground hue={hue} animated={isHeroRoute} intensity={intensity} />;
}
