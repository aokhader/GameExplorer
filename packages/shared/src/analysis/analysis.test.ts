import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../game-logic/chess/engine';
import { checkersAnalysis, reversiAnalysis } from './adapters';
import { createChessAnalysis, MATE_SCORE, chessScore } from './chess';
import { gradeForLoss, logisticShare, type GradeThresholds } from './types';

const T: GradeThresholds = { inaccuracy: 50, mistake: 100, blunder: 200 };

describe('gradeForLoss', () => {
  it('calls the engine\'s own move best, however much it "lost"', () => {
    // Matching the engine wins outright: in a lost position every move drops
    // score, and the best available one must not be graded a blunder for it.
    expect(gradeForLoss(0, T, true)).toBe('best');
    expect(gradeForLoss(9999, T, true)).toBe('best');
  });

  it('bands a loss by the thresholds, inclusive at each boundary', () => {
    expect(gradeForLoss(0, T, false)).toBe('good');
    expect(gradeForLoss(49, T, false)).toBe('good');
    expect(gradeForLoss(50, T, false)).toBe('inaccuracy');
    expect(gradeForLoss(99, T, false)).toBe('inaccuracy');
    expect(gradeForLoss(100, T, false)).toBe('mistake');
    expect(gradeForLoss(199, T, false)).toBe('mistake');
    expect(gradeForLoss(200, T, false)).toBe('blunder');
  });
});

describe('logisticShare', () => {
  it('gives a level position half the bar', () => {
    expect(logisticShare(0, 300)).toBe(0.5);
  });

  it('gives White ~73% at one scale unit, and mirrors for Black', () => {
    expect(logisticShare(300, 300)).toBeCloseTo(0.731, 3);
    expect(logisticShare(-300, 300)).toBeCloseTo(0.269, 3);
  });

  it('stays inside the bar for any score', () => {
    for (const score of [-1e6, -5000, 0, 5000, 1e6]) {
      const share = logisticShare(score, 300);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});

describe('chessScore — the White-positive invariant', () => {
  it('passes a White-to-move score through unchanged', () => {
    expect(chessScore(120, null, true)).toBe(120);
  });

  it('flips a Black-to-move score, since UCI reports side-to-move relative', () => {
    // +120 for Black to move means Black is better, i.e. −120 for White.
    expect(chessScore(120, null, false)).toBe(-120);
  });

  it('scores a mate as large and finite, so swing maths never sees Infinity', () => {
    const mateForWhite = chessScore(null, 3, true);
    expect(mateForWhite).toBe(MATE_SCORE - 3);
    expect(Number.isFinite(mateForWhite)).toBe(true);
    // Mate in 1 must outrank mate in 5 — sooner is better.
    expect(chessScore(null, 1, true)).toBeGreaterThan(chessScore(null, 5, true));
  });

  it('mirrors a mate when Black is to move', () => {
    expect(chessScore(null, 3, false)).toBe(-(MATE_SCORE - 3));
  });
});

describe('createChessAnalysis — terminal positions never reach the engine', () => {
  // Arasan answers a mated root with a bare `bestmove (none)` and no score line,
  // so a flat 0.00 on the most decisive position in the game was a real bug.
  const neverCalled = () => {
    throw new Error('engine must not be consulted for a finished position');
  };
  const adapter = createChessAnalysis(neverCalled, { scanBudgetMs: 0, liveBudgetMs: 0 });

  it('scores checkmate from the rules, against the mated side', async () => {
    // Fool's mate: White is mated with White to move.
    let state = ChessEngine.newGame();
    for (const [from, to] of [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ] as const) {
      const r = ChessEngine.validateMove(state, from, to);
      expect(r.valid).toBe(true);
      state = r.resultingState!;
    }
    expect(state.isCheckmate).toBe(true);

    const evaluation = await adapter.evaluate(state, 100);
    expect(evaluation.terminal).toBe(true);
    expect(evaluation.mate).toBe(0);
    expect(evaluation.bestMove).toBeNull();
    // White was mated, so the score is Black's.
    expect(evaluation.score).toBe(-MATE_SCORE);
    expect(adapter.formatScore(evaluation)).toBe('Checkmate — Black wins');
    // A delivered mate pins the bar to the winner's end.
    expect(adapter.whiteShare(evaluation)).toBeLessThan(0.05);
  });
});

describe('board-game adapters are engine-neutral', () => {
  it('grades a reversi pass as ungradeable — nobody chose it', () => {
    const passState = {
      moveHistory: [{ position: undefined }],
      currentTurn: 'black',
    } as never;
    expect(reversiAnalysis.lastMove(passState)).toBeNull();
  });

  it('reads the side to move off the state for both games', () => {
    expect(checkersAnalysis.currentTurn({ currentTurn: 'black' } as never)).toBe('black');
    expect(reversiAnalysis.currentTurn({ currentTurn: 'white' } as never)).toBe('white');
  });

  it('pins the bar and names a winner in a decided position', () => {
    const decided = { score: 400, mate: null, bestMove: null, terminal: true };
    expect(checkersAnalysis.formatScore(decided)).toBe('White wins');
    expect(checkersAnalysis.whiteShare(decided)).toBeGreaterThan(0.9);
    expect(reversiAnalysis.formatScore({ ...decided, score: -400 })).toBe('Black wins');
    expect(reversiAnalysis.whiteShare({ ...decided, score: 0 })).toBe(0.5);
  });
});
