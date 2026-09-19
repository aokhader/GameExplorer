import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove inner padding (e.g. when the card hosts its own header/scroll regions). */
  flush?: boolean;
  /** Visual emphasis: `raised` adds the elevation shadow. */
  elevation?: 'flat' | 'raised';
  /** A clickable card: a stronger border under a mouse, and a press on touch. */
  interactive?: boolean;
}

/**
 * The one panel/card surface — replaces the ~30 inline
 * `bg-surface-alt rounded-xl border shadow` repetitions.
 *
 * An interactive card answers a press, not a hover: it presses to 98% over
 * `micro` (motion-spec.md §5.1), which is the response a finger can see. The
 * 4px hover lift and the per-game hover glow it used to carry fired only under
 * a mouse, and the glow had no caller left (`ux-fix-ideas.md` §6.1, §8.4).
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { flush = false, elevation = 'flat', interactive = false, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface-alt border border-border rounded-xl',
        elevation === 'raised' && 'surface-raised',
        interactive &&
          'cursor-pointer motion-control hover:border-border-strong motion-safe:active:scale-[0.98]',
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
