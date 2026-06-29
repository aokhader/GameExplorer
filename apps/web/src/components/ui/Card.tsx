import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove inner padding (e.g. when the card hosts its own header/scroll regions). */
  flush?: boolean;
  /** Visual emphasis: `raised` adds a stronger shadow. */
  elevation?: 'flat' | 'raised';
}

/**
 * The one panel/card surface — replaces the ~30 inline
 * `bg-surface-alt rounded-xl border shadow` repetitions.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { flush = false, elevation = 'flat', className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface-alt border border-border rounded-xl',
        elevation === 'raised' && 'shadow-lg',
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
