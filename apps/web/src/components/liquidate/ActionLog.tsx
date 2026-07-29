'use client';

import React from 'react';
import type { LiquidateGameState } from '@gameexplorer/shared';
import { LQ, seatColor } from './theme';

export interface ActionLogProps {
  state: LiquidateGameState;
  /** Cap the rendered tail; a long game's log can run to thousands of lines. */
  limit?: number;
  className?: string;
}

/**
 * The running commentary. Auto-scrolls to the newest entry, mirroring the
 * move-list behaviour on the other games' boards.
 *
 * Each line leads with the actor's name in their seat colour, so the log can be
 * skimmed for "what did the bots just do to me" without reading every word —
 * the main thing a player wants from it during someone else's turn.
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
      <div className="flex flex-col gap-2">
        {entries.length === 0 && (
          <p className="font-semibold" style={{ fontSize: 11.5, color: LQ.soft }}>
            The board is quiet. Roll to begin.
          </p>
        )}
        {entries.map((entry, i) => {
          const seat = seatOf(entry.playerId);
          const color = seat >= 0 ? seatColor(seat) : LQ.soft;
          const who = seat >= 0 ? state.players[seat].name : null;
          // The engine writes third-person lines that open with the actor's
          // name; splitting it off lets the name take the seat colour without
          // the log and the engine having to agree on a separate field.
          const rest = who && entry.message.startsWith(who)
            ? entry.message.slice(who.length).trimStart()
            : entry.message;

          return (
            <div key={`${i}-${entry.message}`} className="flex items-start gap-2.5">
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: color,
                  marginTop: 5,
                  flex: 'none',
                }}
                aria-hidden="true"
              />
              <div className="font-semibold" style={{ fontSize: 11.5, lineHeight: 1.4, color: LQ.dim }}>
                {who && (
                  <span className="font-bold" style={{ color }}>
                    {who}{' '}
                  </span>
                )}
                {rest}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
