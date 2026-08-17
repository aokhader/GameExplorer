import React from 'react';
import { cn } from '@/lib/utils';
import type { GameAccent } from '@/components/game/GameScreenLayout';

export interface StatusBannerProps {
  /** Which game's neon accent tints the banner. Omit for the neutral gold state. */
  accent?: GameAccent;
  /** Bold headline — "Your move", "Bot is thinking…", "⚡ Double jump available". */
  title: React.ReactNode;
  /** Optional supporting line under the title. */
  description?: React.ReactNode;
  className?: string;
}

/**
 * Per-accent tint (bg / border / title text). Mixed from the theme's own game hue
 * at the design doc's alphas rather than written as literals, so the banner
 * follows the active theme; the title takes the theme's readable step for that hue
 * (`--c-game-*-light`), which on a light theme is a deepened tone, not a neon one.
 */
const ACCENTS: Record<GameAccent | 'gold', string> = {
  chess: 'bg-[color-mix(in_srgb,var(--c-game-chess)_8%,transparent)] border-[color-mix(in_srgb,var(--c-game-chess)_30%,transparent)] [&>[data-title]]:text-[var(--c-game-chess-light)]',
  checkers: 'bg-[color-mix(in_srgb,var(--c-game-checkers)_8%,transparent)] border-[color-mix(in_srgb,var(--c-game-checkers)_30%,transparent)] [&>[data-title]]:text-[var(--c-game-checkers-light)]',
  reversi: 'bg-[color-mix(in_srgb,var(--c-game-reversi)_8%,transparent)] border-[color-mix(in_srgb,var(--c-game-reversi)_30%,transparent)] [&>[data-title]]:text-[var(--c-game-reversi-light)]',
  go: 'bg-[color-mix(in_srgb,var(--c-game-go)_8%,transparent)] border-[color-mix(in_srgb,var(--c-game-go)_30%,transparent)] [&>[data-title]]:text-[var(--c-game-go-light)]',
  liquidate: 'bg-[color-mix(in_srgb,var(--c-game-liquidate)_8%,transparent)] border-[color-mix(in_srgb,var(--c-game-liquidate)_30%,transparent)] [&>[data-title]]:text-[var(--c-game-liquidate-light)]',
  gold: 'bg-accent-muted border-accent/35 [&>[data-title]]:text-accent',
};

/**
 * The accent-tinted status card at the top of the in-game sidebar ("Your
 * move" / "Bot is thinking…" in the Arcade Glow design) — state the player
 * should notice, colored with the game's neon.
 */
export function StatusBanner({ accent, title, description, className }: StatusBannerProps) {
  return (
    <div
      // min-h reserves the title+description height so bot-driven transitions
      // between the one- and two-line states (no user input → counts as CLS)
      // don't shift the sidebar below.
      className={cn('shrink-0 min-h-[66px] rounded-xl border px-4 py-3', ACCENTS[accent ?? 'gold'], className)}
      role="status"
    >
      <div data-title className="text-sm font-bold">{title}</div>
      {description && <div className="mt-1 text-[13px] text-fg-muted">{description}</div>}
    </div>
  );
}
