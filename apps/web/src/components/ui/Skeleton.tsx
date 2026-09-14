import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a pill (rounded-full) — e.g. avatars, chips. */
  circle?: boolean;
}

/**
 * Loading placeholder block, shaped like the content it precedes, so a screen
 * never shows a bare "Loading…" string or a spinner that hard-swaps. Compose
 * with width / height utilities (e.g. `<Skeleton className="h-6 w-32" />`).
 *
 * Pulses between full and half opacity over `slower` — motion-spec.md §5.14.
 * Under reduced motion it holds still at 70%. The ten-second pulse limit in the
 * spec is mobile's, where an endless repeat keeps Android from idling; a web
 * page may pulse for as long as loading lasts.
 */
export function Skeleton({ circle = false, className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-muted/70 motion-safe:animate-skeleton motion-reduce:opacity-70',
        circle ? 'rounded-full' : 'rounded-lg',
        className,
      )}
      {...props}
    />
  );
}
