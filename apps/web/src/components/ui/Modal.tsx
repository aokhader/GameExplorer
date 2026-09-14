'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { MOTION } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/motion';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Footer action row (e.g. Cancel / Confirm). */
  footer?: React.ReactNode;
  /** Max width of the dialog panel. */
  size?: 'sm' | 'md' | 'lg';
  /** Disable closing via backdrop click / Escape (e.g. blocking confirmations). */
  dismissable?: boolean;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Centralized dialog — report modal, promotion picker, confirmations all route
 * through here. Handles portal, Escape, backdrop dismiss, scroll lock, and
 * focus into the panel. Mobile: full-width with safe-area padding.
 *
 * Motion per motion-spec.md §5.10. The scrim fades in over `fast` and never
 * moves — it used to borrow a page keyframe that slid it 20px over 0.8s. The
 * panel fades in and grows from 96% over `moderate`. Closing is opacity only,
 * over `fast`, so the dialog stays mounted that long after `open` goes false,
 * ignoring clicks. Reduced motion skips all of it.
 *
 * The exit needs the caller to keep this mounted and flip `open`. A caller that
 * unmounts it instead closes at once — Liquidate's `TradeModal` does, on purpose,
 * so each offer starts from a blank form.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Rendered while open, and for the length of the exit after. Raised during
  // render the moment `open` turns true, so an opening dialog never lags a frame.
  const [present, setPresent] = React.useState(open);
  if (open && !present) setPresent(true);
  const leaving = present && !open;

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setPresent(false), prefersReducedMotion() ? 0 : MOTION.DURATION.fast);
    return () => window.clearTimeout(t);
  }, [leaving]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissable, onClose]);

  /**
   * Move focus into the dialog — on OPEN only.
   *
   * Deliberately its own effect keyed on `open` alone: callers routinely pass an
   * inline `onClose` arrow, so a shared effect re-ran on every render and yanked
   * focus back to the panel. That made a text field inside a dialog accept one
   * keystroke before going dead, which is how the auction bid box could only be
   * typed one digit at a time.
   */
  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      className={cn('fixed inset-0 z-[60] flex items-center justify-center p-4', leaving && 'pointer-events-none')}
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm',
          leaving ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-appear',
        )}
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-surface-alt border border-border rounded-2xl shadow-xl',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none',
          SIZES[size],
          leaving ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-dialog-in',
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
            {title ? (
              <h2 className="text-lg font-semibold text-fg">{title}</h2>
            ) : (
              <span />
            )}
            {dismissable && (
              <IconButton aria-label="Close dialog" size="sm" onClick={onClose}>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l8 8M14 6l-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </IconButton>
            )}
          </div>
        )}
        <div className="px-5 py-4 text-fg">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-1">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
