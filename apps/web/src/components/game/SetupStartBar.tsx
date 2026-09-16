import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The fade has to match whatever the bar sits on, or it reads as a band.
 * Written out in full: Tailwind only emits classes it sees as complete literals.
 */
const TONES = {
  /** The page background — the bot, pass-and-play and training setup screens. */
  surface: 'from-surface',
  /** Inside a raised card — Liquidate's setup. */
  card: 'from-surface-alt',
} as const;

/**
 * Keeps a setup screen's Start button in reach.
 *
 * The button used to be the last thing in a form taller than the viewport —
 * 984px down at 1440×900, and below the fold on phones — so every game began
 * with a scroll to find it. Stuck to the bottom edge, it rides at the bottom of
 * the screen while the form scrolls under it, then settles into place at the
 * end of the form. The fade lets the options it covers read as continuing.
 */
export function SetupStartBar({
  children,
  tone = 'surface',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]',
        'bg-linear-to-t from-60% to-transparent',
        TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
