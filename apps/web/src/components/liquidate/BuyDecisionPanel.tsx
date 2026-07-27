'use client';

import React from 'react';
import { LIQUIDATE_SYSTEM_COLORS } from '@gameexplorer/ui';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { Button } from '@/components/ui';

export interface BuyDecisionPanelProps {
  state: LiquidateGameState;
  tileId: number;
  dispatch: (action: LiquidateAction) => void;
  /** Opens the full deed card (rent schedule) for this tile. */
  onViewDeed: (tileId: number) => void;
}

/**
 * "You landed on something unclaimed — buy it or send it to auction."
 *
 * Inline in the sidebar rail, not a dialog: this decision is exactly when a
 * player most wants to look at the board (what else is in the system? who owns
 * the neighbours?), and the old centred modal covered it.
 */
export function BuyDecisionPanel({
  state,
  tileId,
  dispatch,
  onViewDeed,
}: BuyDecisionPanelProps) {
  const tile = LiquidateEngine.board(state)[tileId];
  if (!tile || !isOwnable(tile)) return null;

  const actor = state.players.find((p) => p.id === LiquidateEngine.actingPlayerId(state));
  const canAfford = LiquidateEngine.getLegalActions(state).some((a) => a.type === 'buy');
  const bareRent = tile.kind === 'planet' ? tile.rents[0] : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {tile.kind === 'planet' && (
          <span
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
            aria-hidden="true"
          />
        )}
        <span className="truncate text-sm font-semibold text-fg">{tile.name}</span>
        <button
          type="button"
          onClick={() => onViewDeed(tileId)}
          className="ml-auto shrink-0 text-xs text-info hover:underline"
        >
          View deed
        </button>
      </div>

      <div className="flex items-baseline justify-between rounded-lg border border-border bg-surface-muted/40 px-3 py-2">
        <span className="text-xs text-fg-muted">
          {tile.kind === 'planet' ? (
            <span className="capitalize">{tile.system} system</span>
          ) : tile.kind === 'warp-gate' ? (
            'Warp gate'
          ) : (
            'Utility'
          )}
          {bareRent !== null && ` · rent ${formatCredits(bareRent)} bare`}
        </span>
        <span className="shrink-0 tabular-nums text-lg font-semibold text-fg">
          {formatCredits(tile.price)}
        </span>
      </div>

      {!canAfford && (
        <p className="text-xs text-danger">
          {actor ? `${actor.name} holds ` : 'You hold '}
          {formatCredits(actor?.credits ?? 0)} — not enough to claim it.
        </p>
      )}

      <div className="flex gap-2">
        {canAfford && (
          <Button fullWidth onClick={() => dispatch({ type: 'buy' })}>
            Claim for {formatCredits(tile.price)}
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth={!canAfford}
          onClick={() => dispatch({ type: 'decline' })}
        >
          Decline → auction
        </Button>
      </div>
    </div>
  );
}
