'use client';

import React from 'react';
import { LiquidateEngine, formatCredits, type LiquidateGameState } from '@gameexplorer/shared';
import { LQ } from './theme';

type StepState = 'done' | 'active' | 'todo';

export interface TurnStep {
  label: string;
  detail: string;
  state: StepState;
}

/**
 * Where the current turn has got to: Roll → Move → Decide → End.
 *
 * A turn here is several beats long and the middle ones resolve on their own
 * (the roll moves you; the landing may charge rent), so without this the player
 * only ever sees the *next* button and has to infer what just happened. The
 * tracker turns that into something readable: what is done, what is being asked
 * now, and what is still to come.
 */
export function turnSteps(state: LiquidateGameState): TurnStep[] {
  const actingId = LiquidateEngine.actingPlayerId(state);
  const actor = state.players.find((p) => p.id === actingId) ?? null;
  const board = LiquidateEngine.board(state);

  // `awaiting-roll` is the only phase before the roll; every other phase in a
  // turn happens once movement has already resolved.
  const preRoll = state.phase === 'awaiting-roll';
  const deciding =
    state.phase === 'buy-decision' ||
    state.phase === 'auction' ||
    state.phase === 'settling-debt' ||
    state.phase === 'trade-review';
  const ending = state.phase === 'turn-end';

  return [
    {
      label: 'Roll',
      detail: !preRoll && state.dice ? `${state.dice[0]} + ${state.dice[1]}` : '',
      state: preRoll ? 'active' : 'done',
    },
    {
      label: 'Move',
      detail: !preRoll && actor ? `→ ${board[actor.tile]?.name ?? ''}` : '',
      state: preRoll ? 'todo' : 'done',
    },
    {
      label: 'Decide',
      detail: deciding ? decideDetail(state) : preRoll ? '' : 'Nothing to settle',
      state: deciding ? 'active' : preRoll ? 'todo' : 'done',
    },
    {
      label: 'End',
      detail: ending ? 'Ready' : '',
      state: ending ? 'active' : 'todo',
    },
  ];
}

function decideDetail(state: LiquidateGameState): string {
  switch (state.phase) {
    case 'buy-decision':
      return 'Buy or auction';
    case 'auction':
      return 'Bidding open';
    case 'settling-debt':
      return `Owes ${formatCredits(state.pendingDebt?.amount ?? 0)}`;
    default:
      return 'Trade offered';
  }
}

export function TurnSteps({ steps }: { steps: TurnStep[] }) {
  return (
    <div className="flex gap-1.5">
      {steps.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            style={{
              height: 4,
              borderRadius: 3,
              background: s.state === 'done' ? LQ.you : s.state === 'active' ? LQ.accent : LQ.track,
            }}
          />
          <div
            className="font-bold uppercase"
            style={{
              fontSize: 9,
              letterSpacing: '0.03em',
              color: s.state === 'todo' ? LQ.soft : LQ.ink,
            }}
          >
            {s.label}
          </div>
          <div className="truncate font-semibold" style={{ fontSize: 10, color: LQ.soft }}>
            {s.detail}
          </div>
        </div>
      ))}
    </div>
  );
}
