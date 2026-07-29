'use client';

import React from 'react';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { LQ, seatColor } from './theme';

export interface PlayerPanelProps {
  state: LiquidateGameState;
  /** Seat ids controlled by a human at this device. */
  humanIds: string[];
}

/**
 * The standings: cash, net worth, holdings, and status for every player.
 *
 * Highlights whoever must act — which during an auction or a trade review is not
 * necessarily the player whose turn it is. Cash is the display face and net
 * worth the small print, because cash is what every decision in the dock is
 * actually gated on.
 */
export function PlayerPanel({ state, humanIds }: PlayerPanelProps) {
  const actingId = LiquidateEngine.actingPlayerId(state);

  const holdings = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const tile of LiquidateEngine.board(state)) {
      const owner = state.tiles[tile.id].ownerId;
      if (owner && isOwnable(tile)) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  }, [state]);

  return (
    <div className="flex flex-col gap-1.5">
      {state.players.map((player, seat) => {
        const acting = player.id === actingId && !player.bankrupt;
        const color = seatColor(seat);
        const isYou = humanIds.includes(player.id) && humanIds.length < state.players.length;

        return (
          <div
            key={player.id}
            className="flex items-center gap-2.5"
            style={{
              padding: '9px 11px',
              borderRadius: 11,
              background: acting ? `color-mix(in srgb, ${LQ.accent} 12%, transparent)` : 'transparent',
              border: `1px solid ${acting ? LQ.accent : 'transparent'}`,
              opacity: player.bankrupt ? 0.5 : 1,
            }}
          >
            <span
              style={{ width: 11, height: 11, borderRadius: '50%', background: color, flex: 'none' }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-bold" style={{ fontSize: 13, color: LQ.ink }}>
                  {player.name}
                </span>
                {(isYou || player.isBot) && (
                  <span
                    className="shrink-0 font-bold uppercase"
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.05em',
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: isYou ? LQ.accent : `color-mix(in srgb, ${LQ.ink} 12%, transparent)`,
                      color: isYou ? LQ.accentInk : LQ.dim,
                    }}
                  >
                    {isYou ? 'You' : 'Bot'}
                  </span>
                )}
              </div>
              <div className="truncate font-semibold" style={{ fontSize: 10.5, color: LQ.soft }}>
                {player.bankrupt ? (
                  'Folded'
                ) : (
                  <>
                    net {formatCredits(LiquidateEngine.getNetWorth(state, player.id))} ·{' '}
                    {holdings.get(player.id) ?? 0} held
                    {player.inImpound && ' · impounded'}
                    {player.clearancePasses > 0 && ` · ${player.clearancePasses}× pass`}
                  </>
                )}
              </div>
            </div>
            {!player.bankrupt && (
              <span
                className="shrink-0 tabular-nums"
                style={{
                  fontFamily: LQ.dispFont,
                  fontWeight: LQ.dispWeight as unknown as number,
                  fontSize: 14,
                  color: player.credits < 0 ? 'var(--c-danger, #ef4444)' : LQ.ink,
                }}
              >
                {formatCredits(player.credits)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
