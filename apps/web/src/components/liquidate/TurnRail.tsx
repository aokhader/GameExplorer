'use client';

import React from 'react';
import {
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
  type LiquidatePlayer,
} from '@gameexplorer/shared';
import { ActionBar } from './ActionBar';
import { AuctionPanel } from './AuctionPanel';
import { BuyDecisionPanel } from './BuyDecisionPanel';
import { TradeReviewPanel } from './TradeReviewPanel';
import { TurnSteps, turnSteps } from './TurnSteps';
import { LQ, seatColor } from './theme';

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

/** Shared surface for every card in the rail. */
export function railPanel(muted = false): React.CSSProperties {
  return {
    background: muted ? LQ.panel2 : LQ.panel,
    border: `1px solid ${LQ.line}`,
    borderRadius: 16,
    boxShadow: LQ.panelShadow,
  };
}

/**
 * The one place every decision lands.
 *
 * Buy/decline, bidding, and trade responses used to open centred dialogs on top
 * of the board; they live here instead so the board is never covered by a choice
 * that can only be made by looking at it. Player-opened dialogs (holdings,
 * building a trade) are still modals — those are asked for, not imposed.
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
  const steps = turnSteps(state);

  return (
    // Deliberately NOT sticky on narrow screens. Pinning it to the bottom kept
    // the dock reachable while scrolling, but it then floated over the standings
    // and the log — covering the very panels a player scrolls down to read.
    <div className="flex flex-col gap-3">
      {/* Whose move it is, and how far into the turn they are. */}
      {actingPlayer && !state.isGameOver && (
        <div style={{ ...railPanel(), padding: '15px 16px' }} data-testid="liquidate-turn-card">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  flex: 'none',
                  background: seatColor(seat),
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${seatColor(seat)} 30%, transparent)`,
                }}
                aria-hidden="true"
              />
              <span
                className="truncate"
                style={{
                  fontFamily: LQ.dispFont,
                  fontWeight: LQ.dispWeight as unknown as number,
                  letterSpacing: LQ.dispSpace,
                  fontSize: 15,
                  color: LQ.ink,
                }}
              >
                {humanTurn ? `Your turn · ${actingPlayer.name}` : `${actingPlayer.name}'s turn`}
              </span>
            </div>
            <span
              className="shrink-0 tabular-nums"
              style={{
                fontFamily: LQ.dispFont,
                fontWeight: LQ.dispWeight as unknown as number,
                fontSize: 16,
                color: LQ.ink,
              }}
            >
              {formatCredits(actingPlayer.credits)}
            </span>
          </div>
          <div className="mt-3.5">
            <TurnSteps steps={steps} />
          </div>
        </div>
      )}

      {/* The dock. Whatever the game is waiting for, it is answered here. */}
      <div style={{ ...railPanel(), padding: '15px 16px' }} data-testid="liquidate-turn-rail">
        <div
          className="mb-3 font-bold uppercase"
          style={{ fontSize: 10, letterSpacing: '0.1em', color: LQ.accent }}
        >
          {state.isGameOver ? 'Game over' : 'Do this now'}
        </div>

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

        {lastError && (
          <p className="mt-2 font-semibold" style={{ fontSize: 11.5, color: 'var(--c-danger, #ef4444)' }}>
            {lastError}
          </p>
        )}
      </div>
    </div>
  );
}
