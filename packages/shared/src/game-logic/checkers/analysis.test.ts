import { describe, it, expect } from 'vitest';
import { CheckersEngine } from './engine';
import { analyzeCheckersPosition } from './weakEngine';
import type { CheckersGameState, CheckersPiece } from './types';

function emptyBoard(): (CheckersPiece | null)[][] {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function posToRC(pos: string): [row: number, col: number] {
  return [Number(pos[1]) - 1, pos.charCodeAt(0) - 97];
}

/** A board holding only the listed pieces, with `turn` to move. */
function stateWith(
  pieces: Array<[pos: string, color: 'white' | 'black', type?: 'man' | 'king']>,
  turn: 'white' | 'black',
): CheckersGameState {
  const board = emptyBoard();
  for (const [pos, color, type = 'man'] of pieces) {
    const [row, col] = posToRC(pos);
    board[row][col] = { color, type };
  }
  return { ...CheckersEngine.newGame(), board, currentTurn: turn };
}

describe('analyzeCheckersPosition', () => {
  it('calls the opening position level', () => {
    // Symmetric start — neither side should show a meaningful edge.
    const { score, terminal } = analyzeCheckersPosition(CheckersEngine.newGame(), 3);
    expect(terminal).toBe(false);
    expect(Math.abs(score)).toBeLessThan(50);
  });

  it('scores a material edge white-positive', () => {
    // White has two extra men; the sign convention says positive = White.
    const state = stateWith(
      [
        ['b2', 'white'],
        ['d2', 'white'],
        ['f2', 'white'],
        ['g7', 'black'],
      ],
      'white',
    );
    expect(analyzeCheckersPosition(state, 2).score).toBeGreaterThan(100);
  });

  it('scores the mirror position black-positive', () => {
    const state = stateWith(
      [
        ['b2', 'white'],
        ['a7', 'black'],
        ['c7', 'black'],
        ['e7', 'black'],
      ],
      'white',
    );
    expect(analyzeCheckersPosition(state, 2).score).toBeLessThan(-100);
  });

  it('returns a legal move for the side to move', () => {
    const state = CheckersEngine.newGame();
    const { bestMove } = analyzeCheckersPosition(state, 2);
    expect(bestMove).not.toBeNull();
    const legal = CheckersEngine.getAllLegalMoves(state);
    expect(legal.some((m) => m.from === bestMove!.from && m.to === bestMove!.to)).toBe(true);
  });

  it('reports a finished game as terminal with no move', () => {
    // Only white pieces left — black has lost.
    const state = { ...stateWith([['b2', 'white']], 'black'), isGameOver: true, winner: 'white' as const };
    const result = analyzeCheckersPosition(state, 2);
    expect(result.terminal).toBe(true);
    expect(result.bestMove).toBeNull();
    expect(result.score).toBeGreaterThan(0);
  });

  it('is reproducible — review must not add eval noise', () => {
    // getBestCheckersMove randomises on purpose; the review search must not, or
    // the same game would grade differently every time it was opened.
    const state = CheckersEngine.newGame();
    const runs = Array.from({ length: 5 }, () => analyzeCheckersPosition(state, 2).score);
    expect(new Set(runs).size).toBe(1);
  });
});
