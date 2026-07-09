'use client';

import React from 'react';
import { Card } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';

const CONFIRM_WORD = 'DELETE';

/**
 * Danger Zone — permanent account deletion (App Store guideline 5.1.1 requires
 * in-app deletion; this same page is the account-deletion URL Google Play needs).
 * Two-step + type-to-confirm rather than the game screens' two-tap resign: this
 * is irreversible data loss, so it warrants an explicit, deliberate gesture.
 * Only rendered for signed-in users.
 */
export function DeleteAccountCard() {
  const { user, loading } = useAuth();
  const [expanded, setExpanded] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Nothing to delete when signed out; avoid a flash before auth resolves.
  if (loading || !user) return null;

  const canConfirm = confirmText.trim() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/me', { method: 'DELETE' });
      // Clear the local session, then hard-navigate home so every client store
      // (auth/game/socket) is dropped with the destroyed page.
      const { supabase } = await import('@gameexplorer/db');
      await supabase.auth.signOut();
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Card elevation="raised" className="mt-6 px-5 py-1 border-danger/40">
      <h2 className="text-sm font-semibold text-danger-hover uppercase tracking-wide pt-4 pb-1">
        Danger zone
      </h2>
      <div className="py-4">
        {!expanded ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-fg">Delete account</p>
              <p className="text-sm text-fg-muted">
                Permanently remove your account and all associated data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className={cn(
                'shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                'bg-danger/10 border border-danger/40 text-danger-hover hover:bg-danger/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
              )}
            >
              Delete account…
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-fg-muted space-y-2">
              <p className="font-semibold text-fg">
                This permanently deletes your account. It cannot be undone.
              </p>
              <p>The following is erased across all games:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Your profile and sign-in</li>
                <li>All ratings, stats, and saved games</li>
                <li>Friends, blocks, and reports</li>
              </ul>
              <p>
                Type <span className="font-mono font-semibold text-fg">{CONFIRM_WORD}</span> to
                confirm.
              </p>
            </div>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={`Type ${CONFIRM_WORD} to confirm account deletion`}
              className={cn(
                'w-full rounded-lg bg-surface-muted border border-border px-3 py-2 text-fg',
                'placeholder:text-fg-subtle font-mono',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
              )}
            />

            {error && <p className="text-sm text-danger-hover">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canConfirm}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                  'bg-danger text-on-accent hover:bg-danger/90',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
                )}
              >
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setConfirmText('');
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
