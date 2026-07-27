'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS } from '@gameexplorer/ui';
import {
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
  type LiquidatePhase,
  type LiquidatePlayer,
} from '@gameexplorer/shared';
import { Card } from '@/components/ui';
import { ActionBar } from './ActionBar';
import { AuctionPanel } from './AuctionPanel';
import { BuyDecisionPanel } from './BuyDecisionPanel';
import { TradeReviewPanel } from './TradeReviewPanel';

export interface TurnRailProps {
  state: LiquidateGameState;
  actingPlayer: LiquidatePlayer | null;
  /** True when the acting seat belongs to a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
  lastError: string | null;
  onManage: () => void;
  onTrade: () => void;
  onViewDeed: (tileId: number) => void;
}

/** What the game is waiting for, in words. */
const PHASE_LABEL: Record<LiquidatePhase, string> = {
  'awaiting-roll': 'Roll the dice',
  'buy-decision': 'Claim it or send it to auction',
  auction: 'Bidding',
  'settling-debt': 'Settle the debt',
  'trade-review': 'Trade offer on the table',
  'turn-end': 'End the turn',
  'game-over': 'Game over',
};

/**
 * The one place every decision lands.
 *
 * Buy/decline, bidding, and trade responses used to open centred dialogs on top
 * of the board; they live here instead so the board is never covered by a choice
 * that can only be made by looking at it. Player-opened dialogs (deed card,
 * holdings, building a trade) are still modals — those are asked for, not
 * imposed, and are dismissable.
 */
export function TurnRail({
  state,
  actingPlayer,
  humanTurn,
  dispatch,
  lastError,
  onManage,
  onTrade,
  onViewDeed,
}: TurnRailProps) {
  const seat = actingPlayer ? state.players.indexOf(actingPlayer) : -1;
  const phaseLabel = state.isGameOver
    ? 'Game over'
    : actingPlayer?.inImpound && state.phase === 'awaiting-roll'
      ? 'Held in impound'
      : PHASE_LABEL[state.phase];

  return (
    <Card
      className="p-3 max-lg:sticky max-lg:bottom-2 max-lg:z-30 max-lg:shadow-xl"
      data-testid="liquidate-turn-rail"
    >
      {/* Whose move it is, always in the same spot. */}
      {actingPlayer && !state.isGameOver && (
        <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length] }}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-fg">
            {humanTurn ? `Your turn — ${actingPlayer.name}` : `${actingPlayer.name}'s turn`}
          </span>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-muted">
            {formatCredits(actingPlayer.credits)}
          </span>
        </div>
      )}
      {actingPlayer && !state.isGameOver && (
        <p className="mb-2.5 text-xs uppercase tracking-wide text-fg-muted" aria-live="polite">
          {phaseLabel}
        </p>
      )}

      {state.phase === 'buy-decision' && humanTurn && state.pendingPurchase !== null ? (
        <BuyDecisionPanel
          state={state}
          tileId={state.pendingPurchase}
          dispatch={dispatch}
          onViewDeed={onViewDeed}
        />
      ) : state.phase === 'auction' ? (
        <AuctionPanel
          state={state}
          humanTurn={humanTurn}
          dispatch={dispatch}
          onViewDeed={onViewDeed}
        />
      ) : state.phase === 'trade-review' ? (
        <TradeReviewPanel state={state} humanTurn={humanTurn} dispatch={dispatch} />
      ) : (
        <ActionBar
          state={state}
          humanTurn={humanTurn}
          dispatch={dispatch}
          onManage={onManage}
          onTrade={onTrade}
        />
      )}

      {lastError && <p className="mt-2 text-xs text-danger">{lastError}</p>}
    </Card>
  );
}
