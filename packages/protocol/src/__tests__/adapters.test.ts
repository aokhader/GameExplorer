// Per-game behaviour the conformance suite cannot state generically, and the
// places the adapters differ, on purpose, from the Render server's applyMove.
import { describe, expect, it } from 'vitest';
import { ReversiEngine } from '../../../shared/src/game-logic/reversi/engine';
import { ABORT_MOVE_LIMIT } from '../sharedTypes';
import { ADAPTERS, getAdapter } from '../adapters';
import { chessAdapter } from '../adapters/chess';
import { reversiAdapter } from '../adapters/reversi';
import type { OnlineGameAdapter } from '../adapters/types';
import type { GameType } from '../sharedTypes';
import { CHESS_EVERYTHING } from './fixtures/games';

function play<S>(adapter: OnlineGameAdapter<S, unknown, Record<string, never>>, moves: ReadonlyArray<unknown>): S {
  let state = adapter.newGame({});
  for (const m of moves) {
    const r = adapter.apply(state, adapter.sideToMove(state)!, m);
    if (!r.ok) throw new Error(r.reason);
    state = r.state;
  }
  return state;
}

describe('getAdapter', () => {
  it('returns each registered adapter', () => {
    for (const type of ['chess', 'checkers', 'reversi'] as const) expect(getAdapter(type)).toBe(ADAPTERS[type]);
  });

  it('throws on any other name, including ones only Object.prototype has', () => {
    for (const name of ['go', 'liquidate', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(() => getAdapter(name as GameType), name).toThrow(/Unknown game type/);
    }
  });
});

describe('apply', () => {
  it('refuses another game’s move as malformed, instead of handing it to the wrong engine', () => {
    // The Render server picked the engine by the move's `type`, not the game's.
    for (const [type, foreign] of [
      ['chess', { type: 'reversi', position: 'd3' }],
      ['checkers', { type: 'chess', from: 'c3', to: 'd4' }],
      ['reversi', { type: 'checkers', from: 'c3', to: 'd4' }],
    ] as const) {
      const adapter = ADAPTERS[type];
      const r = adapter.apply(adapter.newGame({}), adapter.sideToMove(adapter.newGame({}))!, foreign);
      expect(r).toEqual({ ok: false, reason: 'Malformed move' });
    }
  });

  it('returns the action as parsed, without keys the client added', () => {
    const r = chessAdapter.apply(chessAdapter.newGame({}), 'white', { type: 'chess', from: 'e2', to: 'e4', padding: 'p'.repeat(5000) });
    expect(r.ok && r.action).toEqual({ type: 'chess', from: 'e2', to: 'e4' });
  });

  it('chess: refuses a promotion sent without its piece, and takes one sent with it', () => {
    // The fixture line up to its promotion: a white pawn on a7, a8 free.
    const state = play(chessAdapter, CHESS_EVERYTHING.slice(0, -2));
    // On Render the first of these threw inside the handler (SERVER_ERROR).
    expect(chessAdapter.apply(state, 'white', { type: 'chess', from: 'a7', to: 'a8' })).toEqual({ ok: false, reason: 'Choose a piece to promote to' });
    const r = chessAdapter.apply(state, 'white', { type: 'chess', from: 'a7', to: 'a8', promotion: 'knight' });
    expect(r.ok && r.state.board[7][0]).toEqual({ type: 'knight', color: 'white' });
  });

  it('reversi: a forced pass is part of the move, and counts towards the abort limit', () => {
    const board = Array.from({ length: 8 }, () => Array<{ color: 'black' | 'white' } | null>(8).fill(null));
    board[0][0] = { color: 'black' };
    board[0][1] = { color: 'white' };
    board[7][0] = { color: 'black' };
    board[7][1] = { color: 'white' };
    const start = { ...ReversiEngine.newGame(), board };

    const r = reversiAdapter.apply(start, 'black', { type: 'reversi', position: 'c1' });
    if (!r.ok) throw new Error(r.reason);
    expect(reversiAdapter.sideToMove(r.state)).toBe('black');
    expect(reversiAdapter.moveCount(r.state)).toBe(2); // as the Render server counted it
    expect(r.gameOver).toBeNull();
    // White cannot move "back" into the pass.
    expect(reversiAdapter.apply(r.state, 'white', { type: 'reversi', position: 'c8' })).toEqual({ ok: false, reason: 'Not your turn' });
  });

  it('moveCount is what abort_game compares with ABORT_MOVE_LIMIT', () => {
    const four = play(chessAdapter, [
      { type: 'chess', from: 'e2', to: 'e4' }, { type: 'chess', from: 'e7', to: 'e5' },
      { type: 'chess', from: 'g1', to: 'f3' }, { type: 'chess', from: 'b8', to: 'c6' },
    ]);
    expect(chessAdapter.moveCount(four)).toBe(ABORT_MOVE_LIMIT - 1);
    const five = chessAdapter.apply(four, 'white', { type: 'chess', from: 'f1', to: 'b5' });
    expect(five.ok && chessAdapter.moveCount(five.state)).toBe(ABORT_MOVE_LIMIT);
  });
});
