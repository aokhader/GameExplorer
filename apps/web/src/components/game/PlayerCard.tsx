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
export function PlayerCard({ name, initial, subline, isYou = false, active = false, right }: PlayerCardProps) {
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
            backgroundImage: isYou
              ? 'linear-gradient(160deg,#cda43f,#b8923a)'
              : 'linear-gradient(160deg,#3b82f6,#8b5cf6)',
          }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight truncate">{name}</div>
          {subline && (
            <div className={cn('text-[11px] leading-tight truncate', isYou ? 'text-accent' : 'text-fg-muted')}>
              {subline}
            </div>
          )}
        </div>
      </div>
      {right ??
        (active && (
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full motion-safe:animate-glow-pulse',
              isYou ? 'bg-accent' : 'bg-success',
            )}
            style={{ boxShadow: isYou ? '0 0 10px rgba(205,164,63,0.8)' : '0 0 10px rgba(34,211,170,0.8)' }}
            aria-hidden="true"
          />
        ))}
    </div>
  );
}
