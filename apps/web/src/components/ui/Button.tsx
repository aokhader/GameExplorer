import React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Optional leading icon element. */
  leftIcon?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Gold — the single primary action per screen. Gradient fill + glow-on-hover
  // + a small lift give it real presence (the flat pass had none).
  primary:
    'text-on-accent bg-accent [background-image:var(--gradient-accent)] shadow-sm ' +
    'hover:[box-shadow:var(--shadow-glow-accent)] motion-safe:hover:-translate-y-0.5 ' +
    'focus-visible:ring-focus',
  // Steel-blue, tonal — secondary actions.
  secondary:
    'bg-info-muted text-info-hover border border-info/30 hover:bg-info/25 ' +
    'focus-visible:ring-info',
  // Quiet — tertiary / inline actions.
  ghost:
    'bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg ' +
    'focus-visible:ring-focus',
  // Destructive — resign, abort, block, delete.
  danger:
    'bg-danger text-white hover:bg-danger-hover ' +
    'focus-visible:ring-danger',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg', // ≥44px touch target
};

/**
 * The single button system for the app. Built-in focus ring, hover/active and
 * disabled/loading feedback (UX: consistency + feedback + visible focus).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold select-none',
        'transition-[transform,box-shadow,background-color,border-color] duration-200',
        'motion-safe:active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner />
      ) : (
        leftIcon && <span className="-ml-0.5 inline-flex shrink-0">{leftIcon}</span>
      )}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
