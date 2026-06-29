import React from 'react';
import { cn } from '@/lib/utils';

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for accessibility — icon-only buttons need a label. */
  'aria-label': string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:ring-focus',
  secondary:
    'bg-surface-muted text-fg hover:bg-surface-hover border border-border focus-visible:ring-focus',
  danger: 'bg-transparent text-fg-muted hover:bg-danger-muted hover:text-danger-hover focus-visible:ring-danger',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-10 w-10 rounded-lg', // 40px
  lg: 'h-11 w-11 rounded-lg', // 44px touch target
};

/** Square, icon-only button with an enforced accessible label. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-50 disabled:pointer-events-none',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
