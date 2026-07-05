'use client';

import React, { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * App-wide route entrance transition. Re-keys on pathname so each navigation
 * fades the new page in — making the app feel like one product rather than a
 * series of hard reloads.
 *
 * Entrance-only (no exit) by design: Next's App Router swaps route content
 * synchronously, so exit choreography is unreliable here; a clean fade-in is
 * robust and judder-free.
 *
 * CSS-driven (`.page-enter` in globals.css) rather than framer-motion: this
 * wraps every route, and a framer dependency here would put the whole
 * animation engine in every page's initial JS. Framer now loads only with the
 * components that genuinely need it (e.g. the lazy GameResultScreen).
 *
 * Entrance runs on navigation only, never on first load: the animation classes
 * do nothing until a `data-animate` marker is present (see globals.css), and we
 * only add it once the pathname has actually changed. On the initial document
 * load both the server render and the first client render see `navigated=false`
 * → no marker → the prerendered HTML paints immediately (no opacity:0 blank),
 * and hydration matches exactly. The marker also gates descendant `.reveal-up`
 * (GameScreenLayout, hub-page Reveal), so those don't blank first paint either.
 *
 * Calm where it matters: deep gameplay routes get an opacity-only fade (no
 * positional shift — the board must land where the eye expects), and reduced
 * motion collapses to an instant cut.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const { reducedMotion } = useSettings();

  // Have we navigated since the initial load? Computed during render (not in an
  // effect) so it's already correct on the render triggered by the pathname
  // change — flipping it in an effect would retro-fade already-painted content.
  const firstPath = useRef(pathname);
  const navigated = useRef(false);
  if (pathname !== firstPath.current) navigated.current = true;

  const isDeepGame =
    /\/(play|bot|training|analysis)(\/|$)/.test(pathname) || pathname.startsWith('/spectate/');

  if (reducedMotion) return <>{children}</>;

  return (
    <div
      key={pathname}
      data-animate={navigated.current ? '' : undefined}
      className={isDeepGame ? 'page-enter-fade' : 'page-enter'}
    >
      {children}
    </div>
  );
}
