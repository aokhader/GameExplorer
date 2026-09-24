'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@gameexplorer/db';
import {
  canSubmitUsername,
  claimUsername,
  getProfileState,
  useUsernameAvailability,
} from '@gameexplorer/client';
import { USERNAME_MAX_LENGTH, usernameReasonMessage } from '@gameexplorer/shared';
import { Input } from '@/components/ui/Input';
import { useReturnTo } from '@/components/auth/returnTo';

/**
 * Choose (or confirm) a username after an OAuth sign-in. `/auth/callback`
 * sends every user whose name was built for them here before `next`.
 *
 * The database trigger derives a name from the provider's display name or
 * email; we always ask before it becomes a public handle (chess.com does the
 * same). The field is pre-filled with that name, so keeping it is one click.
 *
 * Claimed once: `games.opponent` stores the username as text, so a later
 * rename would detach a player from their own history. The API refuses a
 * second claim, and the page says so up front.
 */
function ChooseUsernameForm() {
  const router = useRouter();
  // Same same-site guard as the sign-in pages. It also refuses /auth/* paths,
  // which is what stops a crafted link parking someone on this page forever.
  const next = useReturnTo('/profile');

  const [username, setUsername] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace(`/auth/signin?next=${encodeURIComponent(next)}`);
        return;
      }
      const state = await getProfileState();
      if (cancelled) return;
      // Already chosen (another tab, a bookmarked link): nothing to ask.
      if (state.status === 'ok') {
        router.replace(next);
        return;
      }
      const derived = state.status === 'needs-username' ? state.username : null;
      setCurrent(derived);
      setUsername(derived ?? '');
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  // The pre-filled name is theirs, so it counts as available to them.
  const { state: nameState } = useUsernameAvailability(username, { currentUsername: current });
  const canSubmit = ready && !saving && canSubmitUsername(nameState) && !claimError;

  const handleContinue = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await claimUsername(username.trim());
    if (result.ok) {
      router.replace(next);
      return;
    }
    setSaving(false);
    if (result.reason === 'error') {
      setError(result.error);
    } else {
      // The database refused a name the live check had allowed — a lost race,
      // or the profanity filter, which only the server runs.
      setClaimError(usernameReasonMessage(result.reason));
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">Choose your username</h1>
      <p className="text-center text-sm text-fg-muted mb-8">
        This is the name other players see. You can’t change it later.
      </p>

      <form
        className="rounded-xl border border-border bg-surface-alt p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleContinue();
        }}
      >
        <Input
          label="Username"
          fieldSize="lg"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setClaimError(null);
          }}
          hint={nameState.hint}
          error={claimError ?? nameState.error}
          maxLength={USERNAME_MAX_LENGTH}
          disabled={!ready || saving}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {error && <p className="text-sm text-danger-hover">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full min-h-11 py-2.5 rounded-lg bg-accent text-on-accent font-semibold hover:brightness-110 disabled:opacity-50 transition-all text-sm"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </>
  );
}

export default function ChooseUsernamePage() {
  return (
    <div className="relative min-h-svh flex items-center justify-center px-4 pt-16">
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="text-center text-fg-muted">Loading…</div>}>
          <ChooseUsernameForm />
        </Suspense>
      </div>
    </div>
  );
}
