// The conformance suite must fail a broken adapter, or its passes mean
// nothing. Each case breaks the chess adapter in one way and names the check
// that has to catch it.
import { describe, expect, it } from 'vitest';
import { checkersAdapter } from '../adapters/checkers';
import { chessAdapter } from '../adapters/chess';
import { conformanceChecks } from '../adapters/conformance';
import type { OnlineGameAdapter } from '../adapters/types';
import { CHECKERS_FIXTURE, CHESS_FIXTURE } from './fixtures/games';

const base = chessAdapter as unknown as OnlineGameAdapter<any, any, any>;

const broken: Array<[string, string, OnlineGameAdapter<any, any, any>]> = [
  ['writes into the state it was given', 'apply mutates neither', {
    ...base,
    apply(state, color, action) {
      const r = base.apply(state, color, action);
      if (r.ok) state.halfMoveClock = -1;
      return r;
    },
  }],
  ['hands malformed input straight to the engine', 'malformed and off-board actions are refused', {
    ...base,
    apply(state, color, action) {
      const a = action as { from: string; to: string };
      return a?.from === 'z9' ? (() => { throw new TypeError('off the board'); })() : base.apply(state, color, action);
    },
  }],
  ['keeps a Date in its state', 'plain JSON', {
    ...base,
    newGame: (o) => ({ ...base.newGame(o), startedAt: new Date(0) }),
  }],
  ['puts randomness in its state', 'replaying the same actions', {
    ...base,
    apply(state, color, action) {
      const r = base.apply(state, color, action);
      return r.ok ? { ...r, state: { ...r.state, nonce: Math.random() } } : r;
    },
  }],
  ['lets either side move', 'only the side to move may move', {
    ...base,
    apply: (state, _color, action) => base.apply(state, state.currentTurn, action),
  }],
  ['never counts a move', 'every move counts', {
    ...base,
    moveCount: () => 0,
  }],
  ['never reports a result', 'only the last move of a finished game reports a result', {
    ...base,
    apply(state, color, action) {
      const r = base.apply(state, color, action);
      return r.ok ? { ...r, gameOver: null } : r;
    },
  }],
  ['opens with the wrong side', 'a new game has white to move', {
    ...base,
    sideToMove: (state) => (state.moveHistory.length === 0 ? 'black' : state.currentTurn),
  }],
];

describe('the conformance suite catches a broken adapter', () => {
  it.each(broken)('one that %s', (_what, checkName, adapter) => {
    const check = conformanceChecks(adapter, CHESS_FIXTURE).find(c => c.name.startsWith(checkName) || c.name.includes(checkName));
    expect(check, `no check named like "${checkName}"`).toBeDefined();
    expect(() => check!.run()).toThrow();
  });

  it('and passes the real one', () => {
    for (const check of conformanceChecks(base, CHESS_FIXTURE)) expect(check.run).not.toThrow();
  });

  // Chess can't show this one: a mated or stalemated position has no legal
  // move, so the engine refuses everything anyway. A checkers draw on the move
  // limit still has moves, and only the adapter's own check stops them.
  it('one that plays on after a drawn game', () => {
    const checkers = checkersAdapter as unknown as OnlineGameAdapter<any, any, any>;
    const playsOn: OnlineGameAdapter<any, any, any> = {
      ...checkers,
      apply: (state, color, action) => checkers.apply({ ...state, isGameOver: false }, color, action),
    };
    const check = conformanceChecks(playsOn, CHECKERS_FIXTURE).find(c => c.name.startsWith('a finished game'))!;
    expect(() => check.run()).toThrow(/was accepted/);
  });
});
