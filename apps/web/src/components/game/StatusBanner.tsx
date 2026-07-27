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

/** Per-accent tint (bg / border / title text), straight from the design doc. */
const ACCENTS: Record<GameAccent | 'gold', string> = {
  chess: 'bg-[rgba(59,130,246,0.08)] border-[rgba(59,130,246,0.3)] [&>[data-title]]:text-[#7db1ff]',
  checkers: 'bg-[rgba(236,72,153,0.08)] border-[rgba(236,72,153,0.3)] [&>[data-title]]:text-[#ff8fc4]',
  reversi: 'bg-[rgba(163,230,53,0.08)] border-[rgba(163,230,53,0.3)] [&>[data-title]]:text-[#bef264]',
  liquidate: 'bg-[rgba(139,92,246,0.08)] border-[rgba(139,92,246,0.3)] [&>[data-title]]:text-[#c4b5fd]',
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
