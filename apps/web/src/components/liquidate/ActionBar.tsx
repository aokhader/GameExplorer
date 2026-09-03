'use client';

import React from 'react';
import {
  LIQUIDATE_IMPOUND_FINE,
  LiquidateEngine,
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
} from '@finesse/shared';
import { DockButton } from './DockButton';
import { LQ } from './theme';

export interface ActionBarProps {
  state: LiquidateGameState;
  /** True when the acting seat belongs to a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
  onManage: () => void;
  onTrade: () => void;
}

/**
 * The turn controls — "do this now".
 *
 * Every button is gated on `getLegalActions`, so the dock can never offer a move
 * the engine would reject: the engine stays the single source of truth for the
 * rules and this component only decides presentation and ordering. The one
 * addition the redesign makes is that an *illegal but expected* action is shown
 * disabled with the reason, rather than vanishing — "End turn / resolve your
 * landing first" tells a player more than an empty space does.
 */
export function ActionBar({ state, humanTurn, dispatch, onManage, onTrade }: ActionBarProps) {
  const legal = LiquidateEngine.getLegalActions(state);
  const has = (type: LiquidateAction['type']) => legal.some((a) => a.type === type);
  const actor = state.players.find((p) => p.id === LiquidateEngine.actingPlayerId(state));

  if (state.isGameOver) {
    return (
      <p className="font-semibold" style={{ fontSize: 13, color: LQ.dim }}>
        The game is over.
      </p>
    );
  }

  if (!humanTurn) {
    return (
      <p className="font-semibold" style={{ fontSize: 13, color: LQ.dim }} aria-live="polite">
        {actor ? `${actor.name} is thinking…` : 'Waiting…'}
      </p>
    );
  }

  const canManage = legal.some((a) =>
    ['build', 'sell-building', 'mortgage', 'unmortgage'].includes(a.type),
  );
  const canTrade = state.phase === 'awaiting-roll' || state.phase === 'turn-end';

  return (
    <div className="flex flex-col gap-2">
      {state.phase === 'settling-debt' && (
        <p
          className="font-semibold"
          style={{
            borderRadius: 11,
            border: '1px solid color-mix(in srgb, var(--c-danger, #ef4444) 40%, transparent)',
            background: 'color-mix(in srgb, var(--c-danger, #ef4444) 12%, transparent)',
            padding: '9px 11px',
            fontSize: 11.5,
            lineHeight: 1.4,
            color: 'var(--c-danger, #ef4444)',
          }}
        >
          {actor?.name} owes {formatCredits(state.pendingDebt?.amount ?? 0)}. Raise it by selling or
          mortgaging, or fold.
        </p>
      )}

      {has('roll') && (
        <DockButton
          variant="primary"
          char="⚄"
          label={actor?.inImpound ? 'Roll for doubles' : 'Roll dice'}
          sub={actor?.inImpound ? 'Doubles frees your ship' : 'Move around the loop'}
          onClick={() => dispatch({ type: 'roll' })}
        />
      )}

      {has('pay-fine') && (
        <DockButton
          variant="ghost"
          char="⊗"
          label="Pay the fine"
          sub="Leave Impound immediately"
          right={formatCredits(LIQUIDATE_IMPOUND_FINE)}
          onClick={() => dispatch({ type: 'pay-fine' })}
        />
      )}

      {has('use-clearance-pass') && (
        <DockButton
          variant="ghost"
          char="✦"
          label="Use Clearance Pass"
          sub="Spend a held pass to leave Impound"
          onClick={() => dispatch({ type: 'use-clearance-pass' })}
        />
      )}

      {has('end-turn') ? (
        <DockButton
          variant="primary"
          char="→"
          label="End turn"
          sub="Pass play to the next seat"
          onClick={() => dispatch({ type: 'end-turn' })}
        />
      ) : (
        !has('roll') && (
          <DockButton variant="subtle" char="→" label="End turn" sub="Resolve your landing first" disabled />
        )
      )}

      <DockButton
        variant="subtle"
        char="⇆"
        label="Propose a trade"
        sub={canTrade ? 'Swap tiles or credits' : 'Only on your own turn'}
        disabled={!canTrade}
        onClick={onTrade}
      />

      <DockButton
        variant="subtle"
        char="⚙"
        label="Manage assets"
        sub={canManage ? 'Build · mortgage · sell' : 'Nothing to manage yet'}
        disabled={!canManage}
        onClick={onManage}
      />

      {has('declare-bankruptcy') && (
        <DockButton
          variant="danger"
          char="✕"
          label="Fold"
          sub="Leave the game and forfeit your holdings"
          onClick={() => dispatch({ type: 'declare-bankruptcy' })}
        />
      )}
    </div>
  );
}
