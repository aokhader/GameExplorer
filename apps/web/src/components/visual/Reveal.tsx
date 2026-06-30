import React from 'react';
import { cn } from '@/lib/utils';

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger delay in ms (e.g. index * 80 for a list). */
  delay?: number;
  /** Render as a different element (defaults to a div). */
  as?: React.ElementType;
}

/**
 * Entrance-reveal wrapper — fades + slides content up on first paint via the
 * `.reveal-up` keyframe (reduced-motion gated in globals.css). Pass `delay` to
 * stagger a group (cards, list items). The `both` fill keeps it hidden until the
 * delay elapses, so staggered groups animate in sequence rather than all at once.
 */
export function Reveal({ delay = 0, as: Tag = 'div', className, style, children, ...props }: RevealProps) {
  return (
    <Tag
      className={cn('reveal-up', className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}
      {...props}
    >
      {children}
    </Tag>
  );
}
