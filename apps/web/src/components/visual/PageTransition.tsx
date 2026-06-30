'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSettings } from '@/components/providers/SettingsProvider';
import { easeOut } from '@/lib/motion';

/**
 * App-wide route entrance transition. Re-keys on pathname so each navigation
 * fades the new page in — making the app feel like one product rather than a
 * series of hard reloads.
 *
 * Entrance-only (no exit) by design: Next's App Router swaps route content
 * synchronously, so AnimatePresence exit choreography is unreliable here; a
 * clean fade-in is robust and judder-free.
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
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: isDeepGame ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
    >
      {children}
    </motion.div>
  );
}
