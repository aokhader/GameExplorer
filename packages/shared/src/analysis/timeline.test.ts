import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../game-logic/chess/engine';
import { getPieceAt } from '../game-logic/chess/utils';
import { CheckersEngine } from '../game-logic/checkers/engine';
import { ReversiEngine } from '../game-logic/reversi/engine';
import { replayCheckersMoves, replayChessMoves, replayReversiMoves } from './timeline';

// Reviewing a *saved* game means rebuilding its positions from a move list —
// the row stores moves, not states. These pin the three properties review
// depends on: N moves give N+1 positions, the last one matches playing it out,
// and a malformed tail truncates rather than throwing the game away.

describe('replayChessMoves', () => {
  it('returns the starting position for an empty game', () => {
    const timeline = replayChessMoves([]);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].moveHistory).toHaveLength(0);
  });

  it('rebuilds a game so the final position matches playing it out', () => {
    const moves = [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ];
    const timeline = replayChessMoves(moves);

    expect(timeline).toHaveLength(moves.length + 1);
    // Fool's mate — and the terminal flags must survive the replay, since review
    // scores a finished position from the rules rather than from the engine.
    const final = timeline[timeline.length - 1];
    expect(final.isCheckmate).toBe(true);
    expect(final.currentTurn).toBe('white');
  });

  it('stops at the first illegal move instead of discarding the game', () => {
    // The second move is nonsense; the first is fine and stays reviewable.
    const timeline = replayChessMoves([
      { from: 'e2', to: 'e4' },
      { from: 'a1', to: 'h8' },
      { from: 'd2', to: 'd4' },
    ]);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].moveHistory).toHaveLength(1);
  });

  it('replays a promotion with the piece that was actually chosen', () => {
    // Walk a white pawn to the eighth rank, then under-promote to a knight.
    let state = ChessEngine.newGame();
    const setup = [
      ['b2', 'b4'], ['a7', 'a5'], ['b4', 'a5'], ['b7', 'b6'],
      ['a5', 'b6'], ['h7', 'h6'], ['b6', 'b7'], ['h6', 'h5'],
    ] as const;
    for (const [from, to] of setup) {
      const r = ChessEngine.validateMove(state, from, to);
      expect(r.valid).toBe(true);
      state = r.resultingState!;
    }

    const timeline = replayChessMoves([
      ...setup.map(([from, to]) => ({ from, to })),
      { from: 'b7', to: 'a8', promotion: 'knight' as const },
    ]);
    const final = timeline[timeline.length - 1];
    expect(getPieceAt(final.board, 'a8')?.type).toBe('knight');
  });
});

describe('replayCheckersMoves', () => {
  it('rebuilds a game move for move', () => {
    const opening = CheckersEngine.getAllLegalMoves(CheckersEngine.newGame())[0];
    const timeline = replayCheckersMoves([{ from: opening.from, to: opening.to }]);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].moveHistory).toHaveLength(1);
    expect(timeline[1].currentTurn).toBe('black');
  });

  it('truncates on an illegal move', () => {
    const timeline = replayCheckersMoves([{ from: 'a1', to: 'h8' }]);
    expect(timeline).toHaveLength(1);
  });
});

describe('replayReversiMoves', () => {
  it('rebuilds a game move for move', () => {
    const timeline = replayReversiMoves([{ position: 'd3' }]);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].currentTurn).toBe('white');
  });

  it('replays a pass, which has no square to validate', () => {
    // A pass is a forced non-decision, so it must never be treated as illegal
    // and truncate the rest of the game.
    const start = ReversiEngine.newGame();
    const timeline = replayReversiMoves([{ position: null }]);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].currentTurn).not.toBe(start.currentTurn);
  });

  it('truncates on an illegal placement', () => {
    // d4 is occupied at the start, so nothing may be placed there.
    const timeline = replayReversiMoves([{ position: 'd4' }]);
    expect(timeline).toHaveLength(1);
  });
});
