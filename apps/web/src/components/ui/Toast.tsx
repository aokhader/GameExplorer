'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { MOTION } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';

export type ToastVariant = 'neutral' | 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  /** Playing its exit; removed once that finishes. */
  leaving: boolean;
}

interface ToastContextValue {
  /** Show a transient toast. Returns nothing; auto-dismisses. */
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Access the toast dispatcher. Must be used under <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}

const VARIANTS: Record<ToastVariant, string> = {
  neutral: 'bg-surface-alt border-border text-fg',
  success: 'bg-surface-alt border-success/40 text-success',
  danger:  'bg-surface-alt border-danger/40 text-danger-hover',
  info:    'bg-surface-alt border-info/40 text-info-hover',
};

/** How long a toast stays up before it starts to leave. */
const VISIBLE_MS = 3000;

let nextId = 0;

/**
 * App-wide toast host. Mount once near the root; call `useToast().toast(...)`
 * from anywhere (copy-link feedback, action confirmations).
 *
 * Motion per motion-spec.md §5.11: a toast rises 12px from the bottom edge as
 * it fades in over `base`, and fades out over `fast`. Under reduced motion it
 * still fades both ways, because a toast's arrival is the feedback.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const toast = React.useCallback((message: string, variant: ToastVariant = 'neutral') => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, message, variant, leaving: false }]);
    setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, MOTION.DURATION.fast);
    }, VISIBLE_MS);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2"
            style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            aria-live="polite"
            aria-atomic="true"
          >
            {items.map((t) => (
              <div
                key={t.id}
                role="status"
                className={cn(
                  'rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg',
                  'max-w-[calc(100vw-2rem)]',
                  t.leaving ? 'animate-fade-out' : 'motion-safe:animate-toast-in motion-reduce:animate-appear',
                  VARIANTS[t.variant],
                )}
              >
                {t.message}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
