'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { cn } from '@/lib/utils';

export interface GameActionsProps {
  /** Offer (multiplayer) or agree (vs bot) a draw. Omit for games without draws (reversi). */
  onDraw?: () => void;
  drawLabel?: string;
  /** Forfeit the game. Omit while the game can still be aborted instead. */
  onResign?: () => void;
  resignLabel?: string;
  /** Abort (multiplayer, before enough moves are played). Rendered in the resign slot, neutral style. */
  onAbort?: () => void;
  /**
   * Turn the board around. Omit for reversi, where `playerColor` is the tap gate
   * rather than a viewpoint, and for screens with no fixed viewpoint at all.
   * Stays enabled after the game ends — reviewing a finished board is exactly
   * when you want to see it from the other side.
   */
  onFlip?: () => void;
  /** Disables the draw/resign buttons (e.g. once the game is over). */
  disabled?: boolean;
  className?: string;
}

const neutralClasses =
  'bg-white/5 border-white/15 text-fg-muted hover:bg-white/10 hover:text-fg';
const dangerClasses =
  'bg-danger/10 border-danger/40 text-danger-hover hover:bg-danger/20';
const confirmClasses = 'bg-danger border-danger text-white';

/** How long a button stays turned into its own confirmation. */
const CONFIRM_MS = 3000;

/**
 * Two taps for an action that ends the game, unless the player switched
 * "Confirm resignation" off in Settings. The button itself turns into the
 * question for three seconds — no dialog, so the board stays in view.
 */
function useConfirmInPlace(action: (() => void) | undefined, enabled: boolean) {
  const [armed, setArmed] = useState(false);
  // Read synchronously: on a fast double-click both handlers would otherwise
  // close over `armed === false` and the second would re-arm, not act.
  const armedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const press = () => {
    if (!action) return;
    if (!enabled || armedRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      armedRef.current = false;
      setArmed(false);
      action();
      return;
    }
    armedRef.current = true;
    setArmed(true);
    timeoutRef.current = setTimeout(() => {
      armedRef.current = false;
      setArmed(false);
    }, CONFIRM_MS);
  };

  return { armed, press };
}

/**
 * The in-game action row, shared by multiplayer and bot/training screens.
 *
 * Harmless first, the game-ender last and set apart (`ux-fix-ideas.md` §8.5):
 * Flip, then Draw, then — past extra room — Resign. Resign and Draw both
 * confirm in place: the first tap turns the button into "Resign?" / "Draw?"
 * for three seconds and only a second tap acts, so a stray click never ends a
 * game. The confirmation follows the player's "Confirm resignation" setting.
 */
export function GameActions({
  onDraw,
  drawLabel = '½ Draw',
  onResign,
  resignLabel = 'Resign',
  onAbort,
  onFlip,
  disabled = false,
  className,
}: GameActionsProps) {
  const { settings } = useSettings();
  const confirm = settings.confirmResign !== false;
  const resign = useConfirmInPlace(onResign, confirm);
  const draw = useConfirmInPlace(onDraw, confirm);

  const buttonBase =
    'flex-1 min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-bold ' +
    'motion-control motion-safe:active:scale-[0.98] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className={cn('flex gap-2.5', className)}>
      {onFlip && (
        <button
          type="button"
          onClick={onFlip}
          aria-label="Flip board"
          title="Flip board"
          className={cn(buttonBase, neutralClasses, 'flex-none w-11 px-0 text-base')}
        >
          ⇅
        </button>
      )}
      {onDraw && (
        <button
          type="button"
          onClick={draw.press}
          disabled={disabled}
          className={cn(buttonBase, draw.armed ? 'bg-fg/10 border-fg/40 text-fg' : neutralClasses)}
        >
          {draw.armed ? 'Draw?' : drawLabel}
        </button>
      )}
      {onAbort ? (
        <button
          type="button"
          onClick={onAbort}
          disabled={disabled}
          className={cn(buttonBase, neutralClasses, (onDraw || onFlip) && 'ml-2')}
        >
          Abort
        </button>
      ) : (
        onResign && (
          <button
            type="button"
            onClick={resign.press}
            disabled={disabled}
            // Extra room before the one control that ends the game.
            className={cn(
              buttonBase,
              resign.armed ? confirmClasses : dangerClasses,
              (onDraw || onFlip) && 'ml-2',
            )}
          >
            {resign.armed ? `${resignLabel}?` : resignLabel}
          </button>
        )
      )}
    </div>
  );
}
