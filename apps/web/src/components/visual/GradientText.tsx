import React from 'react';
import { cn } from '@/lib/utils';

export interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Render as a different element (defaults to a span). */
  as?: React.ElementType;
}

/**
 * Two-tone gold gradient display text (the `.text-gradient-gold` clip). Use for
 * hero / section headings to add depth the flat slate pass stripped out. Always
 * has a `text-accent` fallback color for environments without background-clip.
 */
export function GradientText({ as: Tag = 'span', className, children, ...props }: GradientTextProps) {
  return (
    <Tag className={cn('text-gradient-gold text-accent', className)} {...props}>
      {children}
    </Tag>
  );
}
