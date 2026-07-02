'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  /** Disables both buttons (e.g. once the game is over). */
  disabled?: boolean;
  className?: string;
}

const neutralClasses =
  'bg-white/5 border-white/15 text-fg-muted hover:bg-white/10 hover:text-fg';
const dangerClasses =
  'bg-danger/10 border-danger/40 text-danger-hover hover:bg-danger/20';
const confirmClasses = 'bg-danger border-danger text-white';

/**
 * The Arcade Glow in-game action row — the design's "½ Draw / Resign" split
 * pair at the bottom of the sidebar, shared by multiplayer and bot/training
 * screens. Resign asks for a second tap (3s window) so a stray click never
 * throws a game.
 */
export function GameActions({
  onDraw,
  drawLabel = '½ Draw',
  onResign,
  resignLabel = 'Resign',
  onAbort,
  disabled = false,
  className,
}: GameActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const handleResign = () => {
    if (!onResign) return;
    if (confirming) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setConfirming(false);
      onResign();
      return;
    }
    setConfirming(true);
    timeoutRef.current = setTimeout(() => setConfirming(false), 3000);
  };

  const buttonBase =
    'flex-1 min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className={cn('flex gap-2.5', className)}>
      {onDraw && (
        <button type="button" onClick={onDraw} disabled={disabled} className={cn(buttonBase, neutralClasses)}>
          {drawLabel}
        </button>
      )}
      {onAbort ? (
        <button type="button" onClick={onAbort} disabled={disabled} className={cn(buttonBase, neutralClasses)}>
          Abort
        </button>
      ) : (
        onResign && (
          <button
            type="button"
            onClick={handleResign}
            disabled={disabled}
            className={cn(buttonBase, confirming ? confirmClasses : dangerClasses)}
          >
            {confirming ? `${resignLabel}?` : resignLabel}
          </button>
        )
      )}
    </div>
  );
}
