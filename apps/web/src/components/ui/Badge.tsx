import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'accent' | 'info' | 'success' | 'danger' | 'warning';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-muted text-fg-muted',
  accent:  'bg-accent-muted text-accent',
  info:    'bg-info-muted text-info-hover',
  success: 'bg-success/15 text-success',
  danger:  'bg-danger-muted text-danger-hover',
  warning: 'bg-warning/15 text-warning',
};

/** Small status pill — game state, counts, labels. */
export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
