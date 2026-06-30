import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a pill (rounded-full) — e.g. avatars, chips. */
  circle?: boolean;
}

/**
 * Loading placeholder block. A soft pulsing surface tile used to preserve layout
 * while data loads, instead of a bare "Loading…" string. Compose with width /
 * height utilities (e.g. `<Skeleton className="h-6 w-32" />`). The pulse is
 * motion-safe — under reduced motion it sits as a static tile.
 */
export function Skeleton({ circle = false, className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-muted/70 motion-safe:animate-pulse',
        circle ? 'rounded-full' : 'rounded-lg',
        className,
      )}
      {...props}
    />
  );
}
