import React from 'react';
import type { GameId } from '@gameexplorer/shared';
import { cn } from '@/lib/utils';

export type CardGlow = 'accent' | GameId;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove inner padding (e.g. when the card hosts its own header/scroll regions). */
  flush?: boolean;
  /** Visual emphasis: `raised` adds the top-lit sheen + elevation shadow. */
  elevation?: 'flat' | 'raised';
  /** Hover-lift + emphasized border for clickable cards. */
  interactive?: boolean;
  /** Colored glow halo on hover (per-game identity / brand). */
  glow?: CardGlow;
}

/**
 * Keyed by the catalog's `GameId`, so a game added there without a glow here
 * fails to compile. The union used to be written out by hand and had quietly
 * missed Go and Liquidate.
 */
const GLOW_HOVER: Record<CardGlow, string> = {
  accent:    'hover:[box-shadow:var(--shadow-glow-accent)]',
  chess:     'hover:[box-shadow:var(--shadow-glow-chess)]',
  checkers:  'hover:[box-shadow:var(--shadow-glow-checkers)]',
  reversi:   'hover:[box-shadow:var(--shadow-glow-reversi)]',
  go:        'hover:[box-shadow:var(--shadow-glow-go)]',
  liquidate: 'hover:[box-shadow:var(--shadow-glow-liquidate)]',
};

/**
 * The one panel/card surface — replaces the ~30 inline
 * `bg-surface-alt rounded-xl border shadow` repetitions. `raised` adds the
 * Apple-style top-lit sheen + elevation; `interactive`/`glow` give clickable
 * cards a lift and a per-game glow halo on hover.
 *
 * An interactive card lifts 4px on hover over `base` and presses to 98% over
 * `micro` — motion-spec.md §5.1 and §5.2 — both only when motion is allowed.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { flush = false, elevation = 'flat', interactive = false, glow, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface-alt border border-border rounded-xl',
        elevation === 'raised' && 'surface-raised',
        interactive && 'hover-lift cursor-pointer hover:border-border-strong motion-safe:active:scale-[0.98]',
        glow && GLOW_HOVER[glow],
        !flush && 'p-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/** Optional card header row: title + optional trailing actions. */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-3', className)}>
      <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">{title}</h3>
      {action}
    </div>
  );
}
