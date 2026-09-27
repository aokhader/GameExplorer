'use client';

import React from 'react';
import {
  confirmPassword,
  currentReauthMethod,
  needsReauth,
  type ReauthMethod,
  type SocialProvider,
} from '@gameexplorer/client';
import { Card } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';

const CONFIRM_WORD = 'DELETE';

/** Where a provider sign-in lands, so the card opens again ready to finish. */
const ANCHOR = 'delete-account';

const PROVIDER_NAMES: Record<SocialProvider, string> = { google: 'Google', facebook: 'Facebook', apple: 'Apple' };

/**
 * Danger Zone — permanent account deletion (App Store guideline 5.1.1 requires
 * in-app deletion; this same page is the account-deletion URL Google Play needs).
 * Two-step + type-to-confirm rather than the game screens' two-tap resign: this
 * is irreversible data loss, so it warrants an explicit, deliberate gesture.
 * Only rendered for signed-in users.
 *
 * The API also wants a sign-in from the last ten minutes (security audit v2,
 * GX-19). When the session is older, the card asks for the password, or sends
 * the user through their sign-in provider and back here.
 */
export function DeleteAccountCard() {
  const { user, loading } = useAuth();
  const [expanded, setExpanded] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reauth, setReauth] = React.useState<ReauthMethod | null>(null);
  const [password, setPassword] = React.useState('');
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Back from signing in again: open the card where the user left it.
  React.useEffect(() => {
    if (loading || !user || window.location.hash !== `#${ANCHOR}`) return;
    setExpanded(true);
    cardRef.current?.scrollIntoView({ block: 'center' });
  }, [loading, user]);

  // Nothing to delete when signed out; avoid a flash before auth resolves.
  if (loading || !user) return null;

  const canConfirm = confirmText.trim() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/me', { method: 'DELETE' });
      // Clear the local session, then hard-navigate home so every client store
      // (auth/game/socket) is dropped with the destroyed page.
      const { supabase } = await import('@gameexplorer/db');
      await supabase.auth.signOut();
      // Deliberately not router.push, which would keep those stores alive.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    } catch (err) {
      if (needsReauth(err)) setReauth(await currentReauthMethod());
      else setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  async function handlePassword() {
    if (reauth?.kind !== 'password' || !password || busy) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await confirmPassword(reauth.email, password);
    if (signInError) {
      setError(signInError);
      setBusy(false);
      return;
    }
    setPassword('');
    await handleDelete();
  }

  async function handleProvider(provider: SocialProvider) {
    setBusy(true);
    setError(null);
    const { supabase } = await import('@gameexplorer/db');
    const next = `/settings#${ANCHOR}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  function reset() {
    setExpanded(false);
    setConfirmText('');
    setError(null);
    setReauth(null);
    setPassword('');
  }

  const primaryButton = cn(
    'touch-target motion-control motion-safe:active:scale-[0.98] rounded-lg px-4 py-2 text-sm font-semibold',
    'bg-danger text-on-accent hover:bg-danger/90',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
  );
  const fieldClass = cn(
    'w-full rounded-lg bg-surface-muted border border-border px-3 py-2 text-fg',
    'placeholder:text-fg-subtle',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
  );

  return (
    <Card ref={cardRef} id={ANCHOR} elevation="raised" className="mt-6 px-5 py-1 border-danger/40">
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
        ) : reauth ? (
          <div className="space-y-4">
            <div className="text-sm text-fg-muted space-y-2">
              <p className="font-semibold text-fg">Confirm it&apos;s you</p>
              {reauth.kind === 'password' && (
                <p>For your security, enter your password to delete {reauth.email}.</p>
              )}
              {reauth.kind === 'provider' && (
                <p>
                  For your security, sign in again with {PROVIDER_NAMES[reauth.provider]}. You&apos;ll come back
                  here to finish, and have ten minutes to do it.
                </p>
              )}
              {reauth.kind === 'sign-out' && (
                <p>For your security, sign out and sign in again, then delete your account within ten minutes.</p>
              )}
            </div>

            {reauth.kind === 'password' && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePassword()}
                autoComplete="current-password"
                aria-label="Password"
                placeholder="Password"
                className={fieldClass}
              />
            )}

            {error && <p className="text-sm text-danger-hover">{error}</p>}

            <div className="flex items-center gap-3">
              {reauth.kind === 'password' && (
                <button type="button" onClick={handlePassword} disabled={!password || busy} className={primaryButton}>
                  {busy ? 'Deleting…' : 'Confirm and delete'}
                </button>
              )}
              {reauth.kind === 'provider' && (
                <button
                  type="button"
                  onClick={() => handleProvider(reauth.provider)}
                  disabled={busy}
                  className={primaryButton}
                >
                  Sign in with {PROVIDER_NAMES[reauth.provider]}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-fg-muted space-y-2">
              <p className="font-semibold text-fg">
                This permanently deletes {user.email ? <>the account {user.email}</> : 'your account'}. It
                cannot be undone.
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
              className={cn(fieldClass, 'font-mono')}
            />

            {error && <p className="text-sm text-danger-hover">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => canConfirm && handleDelete()}
                disabled={!canConfirm}
                className={primaryButton}
              >
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                onClick={reset}
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
