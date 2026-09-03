'use client';

import React from 'react';
import Link from 'next/link';
import { supabase } from '@finesse/db';
import { useAuth } from '@/hooks/useAuth';
import { SAVE_PROGRESS_PENDING_KEY } from '@/lib/onboarding';

/**
 * The onboarding flow's soft sign-up ask (Arcade Glow, "play first, sign up
 * later"): after a guest finishes the first game they started from /welcome,
 * offer to save their progress — once. Renders nothing for signed-in users,
 * or when the pending flag isn't set. Any choice (including "maybe later")
 * consumes the flag, so the ask never nags.
 */
export function SaveProgressPrompt({ open }: { open: boolean }) {
  const { user, loading } = useAuth();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Snapshot the flag when the result screen opens (localStorage isn't reactive).
  React.useEffect(() => {
    if (open) setPending(localStorage.getItem(SAVE_PROGRESS_PENDING_KEY) === '1');
  }, [open]);

  if (!open || !pending || loading || user) return null;

  const consume = () => {
    localStorage.removeItem(SAVE_PROGRESS_PENDING_KEY);
  };

  const handleGoogle = async () => {
    setError(null);
    consume();
    const next = window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="mt-6 pt-5 border-t border-white/10 text-center">
      <p className="text-sm text-fg-muted leading-relaxed mb-4">
        Create a free account to save your rating, track your match history,
        and pick up right where you left off.
      </p>

      <div className="flex flex-col gap-2.5">
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-white text-[#1f2430] font-bold text-sm hover:brightness-95 transition-all"
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        <Link
          href="/auth/signup"
          onClick={consume}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/15 text-fg font-bold text-sm hover:bg-white/10 transition-colors"
        >
          Sign up with email
        </Link>
      </div>

      {error && <p className="mt-2 text-sm text-danger-hover">{error}</p>}

      <button
        onClick={() => {
          consume();
          setPending(false);
        }}
        className="mt-4 text-[13.5px] text-fg-muted hover:text-fg transition-colors"
      >
        Maybe later — <span className="font-semibold">keep playing as guest</span>
      </button>
    </div>
  );
}
