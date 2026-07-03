'use client';

import React from 'react';
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
 * Calm where it matters: deep gameplay routes get an opacity-only fade (no
 * positional shift — the board must land where the eye expects), and reduced
 * motion collapses to an instant cut.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const { reducedMotion } = useSettings();

  const isDeepGame =
    /\/(play|bot|training|analysis)(\/|$)/.test(pathname) || pathname.startsWith('/spectate/');

  if (reducedMotion) return <>{children}</>;

  return (
    <div key={pathname} className={isDeepGame ? 'page-enter-fade' : 'page-enter'}>
      {children}
    </div>
  );
}
