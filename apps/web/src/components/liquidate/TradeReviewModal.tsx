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
import { Button, Modal } from '@/components/ui';

export interface TradeReviewModalProps {
  state: LiquidateGameState;
  /** True when the recipient is a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
}

function TileRow({ state, tileId }: { state: LiquidateGameState; tileId: number }) {
  const tile = LiquidateEngine.board(state)[tileId];
  if (!isOwnable(tile)) return null;
  return (
    <li className="flex items-center gap-2">
      {tile.kind === 'planet' && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
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
 * The receiving end of a trade. Blocking and non-dismissable — the engine parks
 * the game in `trade-review` until the recipient answers, so a closable dialog
 * would strand the board.
 */
export function TradeReviewModal({ state, humanTurn, dispatch }: TradeReviewModalProps) {
  const trade = state.pendingTrade;
  if (!trade) return null;

  const from = state.players.find((p) => p.id === trade.fromId);
  const to = state.players.find((p) => p.id === trade.toId);
  if (!from || !to) return null;

  return (
    <Modal
      open
      onClose={() => undefined}
      dismissable={false}
      size="md"
      title={`${from.name} offers ${to.name} a trade`}
      footer={
        humanTurn ? (
          <>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: 'respond-trade', accept: false })}
            >
              Decline
            </Button>
            <Button onClick={() => dispatch({ type: 'respond-trade', accept: true })}>
              Accept
            </Button>
          </>
        ) : (
          <span className="text-xs text-fg-muted">{to.name} is considering…</span>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {to.name} receives
          </div>
          <ul className="flex flex-col gap-1">
            {trade.offerTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.offerCredits > 0 && (
              <li className="text-accent">{formatCredits(trade.offerCredits)}</li>
            )}
            {trade.offerTiles.length === 0 && trade.offerCredits === 0 && (
              <li className="text-fg-muted">Nothing</li>
            )}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {to.name} gives up
          </div>
          <ul className="flex flex-col gap-1">
            {trade.requestTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.requestCredits > 0 && (
              <li className="text-danger">{formatCredits(trade.requestCredits)}</li>
            )}
            {trade.requestTiles.length === 0 && trade.requestCredits === 0 && (
              <li className="text-fg-muted">Nothing</li>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
