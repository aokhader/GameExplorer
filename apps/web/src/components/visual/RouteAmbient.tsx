'use client';

import { usePathname } from 'next/navigation';
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

  const hue: AmbientHue =
    seg === 'chess' || seg === 'checkers' || seg === 'reversi' ? seg : 'brand';

  const isHeroRoute =
    pathname === '/' || pathname === '/chess' || pathname === '/checkers' || pathname === '/reversi';
  const isDeepGame =
    /\/(play|bot|training|analysis)(\/|$)/.test(pathname) || pathname.startsWith('/spectate/');

  const intensity = isHeroRoute ? 'bold' : isDeepGame ? 'subtle' : 'default';

  return <AmbientBackground hue={hue} animated={isHeroRoute} intensity={intensity} />;
}
