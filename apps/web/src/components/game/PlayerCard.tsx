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
  /**
   * The rating this player brings to the board, beside their name.
   *
   * It is **the** sign that the game is rated: shown when the result will move
   * a rating and absent when it will not. A rated game used to look exactly
   * like a casual one until the result card named a number, so the one thing
   * the player cannot undo was the one thing the screen never said. A bot's
   * rating is always shown — it is what the bot *is*, not what is at stake.
   */
  rating?: number;
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
export function PlayerCard({
  name,
  initial,
  subline,
  isYou = false,
  active = false,
  right,
  captured,
  rating,
}: PlayerCardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-1.5 border',
        // Flat surfaces: the gold tint is what marks your card, so the
        // opponent's needs no glass and your avatar no gradient.
        isYou ? 'bg-accent-muted border-accent/35' : 'bg-surface-alt border-border',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'font-display grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold',
            isYou ? 'bg-accent text-on-accent' : 'bg-surface-muted text-fg',
          )}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm leading-tight truncate">{name}</span>
            {rating !== undefined && (
              // Plain, not a chip: it reads as part of the name, the way a
              // rating does beside a player everywhere else.
              <span
                className="shrink-0 text-caption font-semibold tabular-nums text-fg-muted"
                title="Your rating — this game is rated"
              >
                {rating}
              </span>
            )}
          </div>
          {/* `accent-text`, not `accent`: this is 11px, and the accent fill color
              is tuned for buttons rather than small type. */}
          {subline && (
            <div className={cn('text-caption leading-tight truncate', isYou ? 'text-[var(--c-accent-text)]' : 'text-fg-muted')}>
              {subline}
            </div>
          )}
        </div>
      </div>
      {captured}
      {right ??
        (active && (
          // Whose move it is — the one place it is drawn now that the board
          // has no turn halo. It pulses three times when the turn arrives and
          // then holds; the glow it used to wear repeated the dot.
          <span
            className={cn(
              'h-3 w-3 shrink-0 rounded-full animate-state-pulse',
              isYou ? 'bg-accent' : 'bg-success',
            )}
            aria-hidden="true"
          />
        ))}
    </div>
  );
}
