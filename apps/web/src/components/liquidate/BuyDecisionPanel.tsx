'use client';

import React from 'react';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { DockButton } from './DockButton';
import { LQ, groupLabel, tileAccent } from './theme';

export interface BuyDecisionPanelProps {
  state: LiquidateGameState;
  tileId: number;
  dispatch: (action: LiquidateAction) => void;
  /** Focuses this tile in the centre inspector. */
  onViewDeed: (tileId: number) => void;
}

/**
 * "You landed on something unclaimed — buy it or send it to auction."
 *
 * Inline in the rail, not a dialog: this decision is exactly when a player most
 * wants to look at the board (what else is in the system? who owns the
 * neighbours?), and the full rent ladder is already in the centre inspector.
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
  const accent = tileAccent(tile);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          style={{ width: 12, height: 12, borderRadius: 4, background: accent, flex: 'none' }}
          aria-hidden="true"
        />
        <span className="truncate font-bold" style={{ fontSize: 13.5, color: LQ.ink }}>
          {tile.name}
        </span>
        <button
          type="button"
          onClick={() => onViewDeed(tileId)}
          className="ml-auto shrink-0 font-semibold hover:underline"
          style={{ fontSize: 11, color: LQ.dim }}
        >
          Inspect
        </button>
      </div>

      <div
        className="flex items-baseline justify-between"
        style={{
          borderRadius: 11,
          border: `1px solid ${LQ.line}`,
          background: LQ.panel2,
          padding: '9px 11px',
        }}
      >
        <span className="truncate font-semibold" style={{ fontSize: 11, color: LQ.dim }}>
          {groupLabel(tile)}
          {tile.kind === 'planet' && ` · rent ${formatCredits(tile.rents[0])} bare`}
        </span>
        <span
          className="shrink-0 tabular-nums"
          style={{
            fontFamily: LQ.dispFont,
            fontWeight: LQ.dispWeight as unknown as number,
            fontSize: 18,
            color: LQ.ink,
          }}
        >
          {formatCredits(tile.price)}
        </span>
      </div>

      {!canAfford && (
        <p className="font-semibold" style={{ fontSize: 11, color: 'var(--c-danger, #ef4444)' }}>
          {actor ? `${actor.name} holds ` : 'You hold '}
          {formatCredits(actor?.credits ?? 0)} — not enough to claim it.
        </p>
      )}

      {canAfford && (
        <DockButton
          variant="primary"
          char="✓"
          label={`Claim ${tile.name}`}
          sub="Adds it to your holdings"
          right={formatCredits(tile.price)}
          onClick={() => dispatch({ type: 'buy' })}
        />
      )}
      <DockButton
        variant="ghost"
        char="⇄"
        label="Decline → auction"
        sub="Open bidding to all players"
        onClick={() => dispatch({ type: 'decline' })}
      />
    </div>
  );
}
