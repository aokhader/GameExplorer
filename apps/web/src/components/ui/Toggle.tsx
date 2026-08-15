'use client';

import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — the switch renders no visible text of its own. */
  label: string;
  /**
   * Greyed out and inert. The caller is responsible for saying *why* nearby;
   * a disabled switch with no explanation reads as a bug.
   */
  disabled?: boolean;
}

/**
 * The app's switch. Lives here rather than inside a page because Settings and
 * the three bot setup screens all need the same control, and the mobile app
 * shows one switch shape everywhere too.
 */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-12 h-7 rounded-full transition-colors shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-2 ring-offset-surface-alt',
        checked ? 'bg-accent' : 'bg-surface-muted',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div
        className={cn(
          'w-5 h-5 bg-white rounded-full shadow mx-1 transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}
