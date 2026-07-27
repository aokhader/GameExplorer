'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS } from '@gameexplorer/ui';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { cn } from '@/lib/utils';

export interface PlayerPanelProps {
  state: LiquidateGameState;
  /** Seat ids controlled by a human at this device. */
  humanIds: string[];
}

/**
 * The seat roster: cash, net worth, holdings, and status for every player.
 * Highlights whoever must act — which during an auction or a trade review is not
 * necessarily the player whose turn it is.
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
    <div className="flex flex-col gap-2">
      {state.players.map((player, seat) => {
        const acting = player.id === actingId;
        const color = LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length];
        return (
          <div
            key={player.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
              player.bankrupt
                ? 'border-border bg-surface-muted/40 opacity-55'
                : acting
                  ? 'border-accent/60 bg-surface-alt'
                  : 'border-border bg-surface-alt/60',
            )}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/40"
              style={{ background: color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-fg">{player.name}</span>
                {player.isBot && (
                  <span className="rounded bg-surface-muted px-1 text-[10px] text-fg-muted">BOT</span>
                )}
                {/* Only worth marking when some seats are bots — in pass-and-play
                    every seat is human, so the badge would be noise. */}
                {humanIds.includes(player.id) && humanIds.length < state.players.length && (
                  <span className="rounded bg-info-muted px-1 text-[10px] text-info">YOU</span>
                )}
                {acting && !player.bankrupt && (
                  <span className="text-[10px] font-semibold text-accent">● to act</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                {player.bankrupt ? (
                  <span>Folded</span>
                ) : (
                  <>
                    <span className="tabular-nums text-fg">{formatCredits(player.credits)}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      net {formatCredits(LiquidateEngine.getNetWorth(state, player.id))}
                    </span>
                    <span>·</span>
                    <span>{holdings.get(player.id) ?? 0} held</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px]">
              {player.inImpound && <span className="text-danger">Impounded</span>}
              {player.clearancePasses > 0 && (
                <span className="text-success">{player.clearancePasses}× pass</span>
              )}
              {player.credits < 0 && <span className="text-danger">in debt</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
