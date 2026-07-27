'use client';

import React from 'react';
import {
  LIQUIDATE_IMPOUND_FINE,
  LiquidateEngine,
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { Button } from '@/components/ui';

export interface ActionBarProps {
  state: LiquidateGameState;
  /** True when the acting seat belongs to a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
  onManage: () => void;
  onTrade: () => void;
}

/**
 * The turn controls.
 *
 * Every button is gated on `getLegalActions`, so the bar can never offer a move
 * the engine would reject — the engine stays the single source of truth for the
 * rules and this component only decides presentation and ordering.
 */
export function ActionBar({ state, humanTurn, dispatch, onManage, onTrade }: ActionBarProps) {
  const legal = LiquidateEngine.getLegalActions(state);
  const has = (type: LiquidateAction['type']) => legal.some((a) => a.type === type);
  const actor = state.players.find((p) => p.id === LiquidateEngine.actingPlayerId(state));

  if (state.isGameOver) {
    return <p className="text-sm text-fg-muted">The game is over.</p>;
  }

  if (!humanTurn) {
    return (
      <p className="text-sm text-fg-muted" aria-live="polite">
        {actor ? `${actor.name} is thinking…` : 'Waiting…'}
      </p>
    );
  }

  // The one move that carries the turn forward, given full width so it is
  // unmistakable; everything else is a secondary option beside it.
  const primary = has('roll') ? 'roll' : has('end-turn') ? 'end-turn' : null;

  const canManage = legal.some((a) =>
    ['build', 'sell-building', 'mortgage', 'unmortgage'].includes(a.type),
  );

  return (
    <div className="flex flex-col gap-2">
      {state.phase === 'settling-debt' && (
        <p className="rounded-lg border border-danger/40 bg-danger-muted/30 px-3 py-2 text-xs text-danger">
          {actor?.name} owes {formatCredits(state.pendingDebt?.amount ?? 0)}. Raise it by selling
          or mortgaging, or fold.
        </p>
      )}

      {primary === 'roll' && (
        <Button fullWidth onClick={() => dispatch({ type: 'roll' })}>
          {actor?.inImpound ? 'Roll for doubles' : 'Roll dice'}
        </Button>
      )}
      {primary === 'end-turn' && (
        <Button fullWidth onClick={() => dispatch({ type: 'end-turn' })}>
          End turn
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {has('pay-fine') && (
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'pay-fine' })}>
            Pay {formatCredits(LIQUIDATE_IMPOUND_FINE)} fine
          </Button>
        )}
        {has('use-clearance-pass') && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => dispatch({ type: 'use-clearance-pass' })}
          >
            Use Clearance Pass
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="secondary" onClick={onManage}>
            Manage holdings
          </Button>
        )}
        {/* Trading is only legal on your own turn, so mirror that here. */}
        {(state.phase === 'awaiting-roll' || state.phase === 'turn-end') && (
          <Button size="sm" variant="secondary" onClick={onTrade}>
            Trade
          </Button>
        )}
        {has('declare-bankruptcy') && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => dispatch({ type: 'declare-bankruptcy' })}
          >
            Fold
          </Button>
        )}
      </div>
    </div>
  );
}
