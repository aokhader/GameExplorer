'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS } from '@gameexplorer/ui';
import type { LiquidateGameState } from '@gameexplorer/shared';

export interface ActionLogProps {
  state: LiquidateGameState;
  /** Cap the rendered tail; a long game's log can run to thousands of lines. */
  limit?: number;
  className?: string;
}

/**
 * The running commentary. Auto-scrolls to the newest entry, mirroring the
 * move-list behaviour on the other games' boards.
 */
export function ActionLog({ state, limit = 60, className }: ActionLogProps) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const entries = state.log.slice(-limit);

  React.useEffect(() => {
    // Fires after layout, so the newest line is fully in view.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [state.log.length]);

  const seatOf = (playerId: string | null): number =>
    playerId ? state.players.findIndex((p) => p.id === playerId) : -1;

  return (
    <div className={className}>
      <div className="flex flex-col gap-1 text-xs">
        {entries.length === 0 && <p className="text-fg-muted">The board is quiet. Roll to begin.</p>}
        {entries.map((entry, i) => {
          const seat = seatOf(entry.playerId);
          return (
            <p key={`${i}-${entry.message}`} className="flex items-start gap-1.5 text-fg-muted">
              <span
                className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    seat >= 0
                      ? LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length]
                      : '#5c6a85',
                }}
                aria-hidden="true"
              />
              <span className="leading-snug">{entry.message}</span>
            </p>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
