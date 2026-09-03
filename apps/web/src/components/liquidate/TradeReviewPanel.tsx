'use client';

import React from 'react';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@finesse/shared';
import { DockButton } from './DockButton';
import { LQ, tileAccent } from './theme';

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
    <li className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 11, color: LQ.dim }}>
      <span
        style={{ width: 8, height: 8, borderRadius: 3, background: tileAccent(tile), flex: 'none' }}
        aria-hidden="true"
      />
      <span className="truncate">{tile.name}</span>
      <span className="ml-auto shrink-0 tabular-nums" style={{ color: LQ.soft }}>
        {formatCredits(tile.price)}
      </span>
    </li>
  );
}

/**
 * The receiving end of a trade — inline in the rail for the same reason as the
 * auction: the offer is only judgeable against the board behind it.
 */
export function TradeReviewPanel({ state, humanTurn, dispatch }: TradeReviewPanelProps) {
  const trade = state.pendingTrade;
  if (!trade) return null;

  const from = state.players.find((p) => p.id === trade.fromId);
  const to = state.players.find((p) => p.id === trade.toId);
  if (!from || !to) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="font-bold" style={{ fontSize: 13.5, color: LQ.ink }}>
        {from.name} offers {to.name} a trade
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div
            className="mb-1 font-bold uppercase"
            style={{ fontSize: 9.5, letterSpacing: '0.05em', color: LQ.you }}
          >
            {to.name} gets
          </div>
          <ul className="flex flex-col gap-1">
            {trade.offerTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.offerCredits > 0 && (
              <li className="font-bold" style={{ fontSize: 11, color: LQ.accent }}>
                {formatCredits(trade.offerCredits)}
              </li>
            )}
            {trade.offerTiles.length === 0 && trade.offerCredits === 0 && (
              <li className="font-semibold" style={{ fontSize: 11, color: LQ.soft }}>
                Nothing
              </li>
            )}
          </ul>
        </div>
        <div>
          <div
            className="mb-1 font-bold uppercase"
            style={{ fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--c-danger, #ef4444)' }}
          >
            {to.name} gives up
          </div>
          <ul className="flex flex-col gap-1">
            {trade.requestTiles.map((id) => (
              <TileRow key={id} state={state} tileId={id} />
            ))}
            {trade.requestCredits > 0 && (
              <li className="font-bold" style={{ fontSize: 11, color: 'var(--c-danger, #ef4444)' }}>
                {formatCredits(trade.requestCredits)}
              </li>
            )}
            {trade.requestTiles.length === 0 && trade.requestCredits === 0 && (
              <li className="font-semibold" style={{ fontSize: 11, color: LQ.soft }}>
                Nothing
              </li>
            )}
          </ul>
        </div>
      </div>

      {humanTurn ? (
        <>
          <DockButton
            variant="primary"
            char="✓"
            label="Accept"
            sub="Swap immediately"
            onClick={() => dispatch({ type: 'respond-trade', accept: true })}
          />
          <DockButton
            variant="ghost"
            char="✕"
            label="Decline"
            sub="Leave everything as it is"
            onClick={() => dispatch({ type: 'respond-trade', accept: false })}
          />
        </>
      ) : (
        <p className="font-semibold" style={{ fontSize: 12.5, color: LQ.dim }} aria-live="polite">
          {to.name} is considering…
        </p>
      )}
    </div>
  );
}
