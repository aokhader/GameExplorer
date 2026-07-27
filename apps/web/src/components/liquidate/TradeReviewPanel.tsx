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

export interface TradeReviewPanelProps {
  state: LiquidateGameState;
  /** True when the recipient is a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
}

function TileRow({ state, tileId }: { state: LiquidateGameState; tileId: number }) {
  const tile = LiquidateEngine.board(state)[tileId];
  if (!isOwnable(tile)) return null;
  return (
    <li className="flex items-center gap-1.5 text-xs">
      {tile.kind === 'planet' && (
        <span
          className="h-2 w-2 shrink-0 rounded-sm"
          style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{tile.name}</span>
      <span className="ml-auto shrink-0 tabular-nums text-fg-muted">
        {formatCredits(tile.price)}
      </span>
    </li>
  );
}

/**
 * The receiving end of a trade — inline in the sidebar rail for the same reason
 * as the auction: the offer is only judgeable against the board behind it.
 */
export function TradeReviewPanel({ state, humanTurn, dispatch }: TradeReviewPanelProps) {
  const trade = state.pendingTrade;
  if (!trade) return null;

  const from = state.players.find((p) => p.id === trade.fromId);
  const to = state.players.find((p) => p.id === trade.toId);
  if (!from || !to) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-sm font-semibold text-fg">
        {from.name} offers {to.name} a trade
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success">
            {to.name} gets
          </div>
          <ul className="flex flex-col gap-1">
            {trade.offerTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.offerCredits > 0 && (
              <li className="text-xs text-accent">{formatCredits(trade.offerCredits)}</li>
            )}
            {trade.offerTiles.length === 0 && trade.offerCredits === 0 && (
              <li className="text-xs text-fg-muted">Nothing</li>
            )}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-danger">
            {to.name} gives up
          </div>
          <ul className="flex flex-col gap-1">
            {trade.requestTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.requestCredits > 0 && (
              <li className="text-xs text-danger">{formatCredits(trade.requestCredits)}</li>
            )}
            {trade.requestTiles.length === 0 && trade.requestCredits === 0 && (
              <li className="text-xs text-fg-muted">Nothing</li>
            )}
          </ul>
        </div>
      </div>

      {humanTurn ? (
        <div className="flex gap-2">
          <Button fullWidth onClick={() => dispatch({ type: 'respond-trade', accept: true })}>
            Accept
          </Button>
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: 'respond-trade', accept: false })}
          >
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-muted" aria-live="polite">
          {to.name} is considering…
        </p>
      )}
    </div>
  );
}
