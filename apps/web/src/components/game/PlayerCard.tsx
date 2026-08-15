import React from 'react';
import { cn } from '@/lib/utils';

export interface PlayerCardProps {
  /** Display name, e.g. "Maya" or "You (alice)". */
  name: string;
  /** Single-letter avatar initial. */
  initial: string;
  /** Small line under the name — rating, difficulty, or a status like "your move". */
  subline?: string;
  /** The local player's card wears a gold tint so "you" is always identifiable. */
  isYou?: boolean;
  /** When true (and no `right` is given) a pulsing "to move" dot shows on the right. */
  active?: boolean;
  /** Right-aligned content — e.g. a clock in multiplayer. Overrides the active dot. */
  right?: React.ReactNode;
  /**
   * Chess capture tray, shown between the name block and `right`. Deliberately
   * inline rather than a row below: the card's 46px height is budgeted by
   * `GameScreenLayout`, and extra height is taken straight out of the board.
   */
  captured?: React.ReactNode;
}

/**
 * The Arcade Glow player card shared by every in-game screen (multiplayer,
 * bot, training): an avatar tile + name + status subline, with a clock or a
 * "to move" pulse on the right. Keeping it in one place is what makes the
 * board screens look identical across single- and multi-player.
 *
 * Deliberately slim (46px): it frames the board rather than competing with it,
 * and every pixel it gives back is a pixel the square board grows by on a short
 * screen. `GameScreenLayout` budgets its column height against that number.
 */
export function PlayerCard({ name, initial, subline, isYou = false, active = false, right, captured }: PlayerCardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-1.5 border',
        isYou ? 'bg-accent-muted border-accent/35' : 'glass border-white/10',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'font-display grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold',
            isYou ? 'text-on-accent' : 'text-white',
          )}
          style={{
            // Your tile is the brand accent, the opponent's is the neutral avatar
            // tile — both theme-driven so they stay in palette.
            backgroundImage: isYou
              ? 'var(--gradient-accent)'
              : 'var(--c-avatar-gradient)',
          }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight truncate">{name}</div>
          {/* `accent-text`, not `accent`: this is 11px, and the accent fill color
              is tuned for buttons rather than small type. */}
          {subline && (
            <div className={cn('text-[11px] leading-tight truncate', isYou ? 'text-[var(--c-accent-text)]' : 'text-fg-muted')}>
              {subline}
            </div>
          )}
        </div>
      </div>
      {captured}
      {right ??
        (active && (
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full motion-safe:animate-glow-pulse',
              isYou ? 'bg-accent' : 'bg-success',
            )}
            style={{
              boxShadow: isYou
                ? '0 0 10px color-mix(in srgb, var(--c-accent) 80%, transparent)'
                : '0 0 10px color-mix(in srgb, var(--c-success-hover) 80%, transparent)',
            }}
            aria-hidden="true"
          />
        ))}
    </div>
  );
}
