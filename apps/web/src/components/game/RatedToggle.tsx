'use client';

import { Toggle } from '@/components/ui';

export interface RatedToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Named in the copy so it's clear *which* rating moves. */
  gameLabel: string;
  /** Null while signed out — rated play needs an account to read/write a rating. */
  userId: string | null;
}

/**
 * The Rated / Casual switch on a bot setup screen.
 *
 * Web bot games used to disagree with each other and with mobile: chess never
 * touched your rating, while checkers and reversi always rated a signed-in
 * game with no way to opt out. Mobile already offered an explicit choice, so
 * that is the behaviour all three web pages adopt.
 *
 * Mobile additionally disables this when offline, because a rated result has to
 * reach Supabase. The web app has no offline mode, so the only gate here is
 * being signed in.
 */
export function RatedToggle({ checked, onChange, gameLabel, userId }: RatedToggleProps) {
  const signedIn = !!userId;
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-6 mb-6 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-lg font-semibold text-fg">Rated</p>
        <p className="text-sm text-fg-muted">
          {signedIn
            ? `Updates your ${gameLabel} rating`
            : 'Sign in to play rated games'}
        </p>
      </div>
      <Toggle
        checked={signedIn && checked}
        onChange={onChange}
        label="Rated"
        disabled={!signedIn}
      />
    </div>
  );
}
