import { describe, it, expect } from 'vitest';
import { ReversiEngine } from './engine';
import { analyzeReversiPosition } from './weakEngine';
import { createInitialGameState, setDiscAt } from './utils';
import type { ReversiBoard, ReversiColor, ReversiGameState } from './types';

function emptyBoard(): ReversiBoard {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function stateWith(
  discs: Array<[string, ReversiColor]>,
  currentTurn: ReversiColor,
  overrides: Partial<ReversiGameState> = {},
): ReversiGameState {
  let board = emptyBoard();
  for (const [pos, color] of discs) board = setDiscAt(board, pos, { color });
  return { ...createInitialGameState(), board, currentTurn, ...overrides };
}

describe('analyzeReversiPosition', () => {
  it('calls the opening position level', () => {
    const { score, terminal } = analyzeReversiPosition(ReversiEngine.newGame(), 3);
    expect(terminal).toBe(false);
    expect(Math.abs(score)).toBeLessThan(120);
  });

  it('reports scores white-positive, not black-positive like the raw search', () => {
    // The underlying minimax maximises for Black (who moves first). Review
    // normalises to White-positive so all three games share one convention —
    // this is the test that would catch the sign flipping back.
    const finished = stateWith([['a1', 'white']], 'black', {
      isGameOver: true,
      winner: 'white',
    });
    expect(analyzeReversiPosition(finished, 1).score).toBeGreaterThan(0);

    const blackWon = stateWith([['a1', 'black']], 'white', {
      isGameOver: true,
      winner: 'black',
    });
    expect(analyzeReversiPosition(blackWon, 1).score).toBeLessThan(0);
  });

  it('prefers a corner when one is on offer', () => {
    // Black to move with h8 available: corners are the game's whole point, so
    // a full-strength search must take it.
    const state = stateWith(
      [
        ['e5', 'black'],
        ['f6', 'white'],
        ['g7', 'white'],
        ['d4', 'white'],
        ['c3', 'black'],
      ],
      'black',
    );
    const legal = ReversiEngine.getAllLegalMoves(state);
    expect(legal).toContain('h8');
    expect(analyzeReversiPosition(state, 3).bestMove?.position).toBe('h8');
  });

  it('returns a legal square for the side to move', () => {
    const state = ReversiEngine.newGame();
    const { bestMove } = analyzeReversiPosition(state, 2);
    expect(ReversiEngine.getAllLegalMoves(state)).toContain(bestMove!.position);
  });

  it('reports a finished game as terminal with no move', () => {
    const state = stateWith([['a1', 'black']], 'white', { isGameOver: true, winner: 'black' });
    const result = analyzeReversiPosition(state, 2);
    expect(result.terminal).toBe(true);
    expect(result.bestMove).toBeNull();
  });

  it('scores through a forced pass instead of blaming the passer', () => {
    // The side to move has no legal square. Scoring the position it's actually
    // handed (rather than bailing) keeps a forced pass out of the blunder list.
    const state = stateWith(
      [
        ['a1', 'white'],
        ['h8', 'black'],
      ],
      'white',
    );
    expect(ReversiEngine.getAllLegalMoves(state)).toHaveLength(0);
    const result = analyzeReversiPosition(state, 2);
    expect(result.bestMove).toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('is reproducible — review must not add eval noise', () => {
    const state = ReversiEngine.newGame();
    const runs = Array.from({ length: 5 }, () => analyzeReversiPosition(state, 2).score);
    expect(new Set(runs).size).toBe(1);
  });
});
