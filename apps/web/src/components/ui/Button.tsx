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

/** The 2px hover lift from motion-spec.md §5.2. Ghost buttons sit inline among text and stay put. */
const LIFT = 'motion-safe:hover:-translate-y-0.5';

const VARIANTS: Record<ButtonVariant, string> = {
  // Gold — the single primary action per screen, and gold is what says so.
  // Flat: the gradient fill and hover glow it had were a second and a third way
  // of saying "this is the gold one" (ux-fix-ideas.md §6.1).
  primary:
    `text-on-accent bg-accent hover:bg-accent-hover shadow-sm ${LIFT} ` +
    'focus-visible:ring-focus',
  // Steel-blue, tonal — secondary actions.
  secondary:
    `bg-info-muted text-info-hover border border-info/30 hover:bg-info/25 ${LIFT} ` +
    'focus-visible:ring-info',
  // Quiet — tertiary / inline actions.
  ghost:
    'bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg ' +
    'focus-visible:ring-focus',
  // Destructive — resign, abort, block, delete.
  danger:
    `bg-danger text-white hover:bg-danger-hover ${LIFT} ` +
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
 *
 * Motion is motion-spec.md §5.1–5.3 through the `motion-control` utility: colour
 * over `fast`, the lift over `base`, a press to 98% over `micro`, and a focus
 * ring that appears at once. Under reduced motion only the colour moves.
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
        'inline-flex items-center justify-center font-semibold select-none touch-target',
        'motion-control motion-safe:active:scale-[0.98]',
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
