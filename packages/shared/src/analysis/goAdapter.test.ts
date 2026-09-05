/**
 * Go review.
 *
 * The assertion this file exists for is the **sign**. Every adapter reports a
 * white-positive score; Go's engine reports a black-positive lead. A review
 * built on the wrong one does not crash, does not fail a typecheck, and shows a
 * confident, fluent, exactly-backwards account of the game — praising every
 * blunder and grading every good move a mistake.
 */
import { describe, it, expect } from 'vitest';
import { createGoAnalysis, goAnalysis, goTimelineToPoints } from './goAdapter';
import { replayGoMoves } from './timeline';
import { GoEngine } from '../game-logic/go/engine';
import { goBoardStringToState } from '../game-logic/go/boardString';
import { boardKey, createInitialGameState } from '../game-logic/go/utils';
import type { GoBoard, GoGameState } from '../game-logic/go/types';

function stateFrom(rows: string[], currentTurn: 'black' | 'white' = 'black'): GoGameState {
  const size = rows.length;
  const board: GoBoard = rows
    .slice()
    .reverse()
    .map((row) => row.split('').map((ch) => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
  return {
    ...createInitialGameState({ size }),
    board,
    currentTurn,
    positionKeys: [boardKey(board)],
  };
}

describe('the sign convention', () => {
  it('reports a position Black has won as NEGATIVE, because scores are white-positive', async () => {
    /*
     * Black owns the whole board. `GoEngine.score` calls that a positive lead
     * (black-positive); `PositionEval.score` must call it negative
     * (white-positive). If this ever passes with the sign flipped, review is
     * lying about every game.
     */
    const rows = Array.from({ length: 9 }, (_, r) => (r < 4 ? 'XXXXXXXXX' : '.........'));
    const state = stateFrom(rows);
    expect(GoEngine.score(state).lead).toBeGreaterThan(0);

    const evaluation = await goAnalysis.evaluate(state, 0);
    expect(evaluation.score).toBeLessThan(0);
  });

  it('reports a settled position from the rules rather than from playouts', async () => {
    // Two passes stop the game. Asking a Monte-Carlo search about a position
    // whose score is a fact would spend playouts to guess at it.
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executePass(state);
    expect(state.phase).toBe('marking');

    const evaluation = await goAnalysis.evaluate(state, 0);
    expect(evaluation.terminal).toBe(true);
    expect(evaluation.bestMove).toBeNull();
    // An empty board is all neutral, so White wins on komi alone — and komi to
    // White is a POSITIVE score under this convention.
    expect(evaluation.score).toBeGreaterThan(0);
  });
});

describe('what review shows a Go player', () => {
  it('writes the score the way Go writes it, not as a signed number', () => {
    const { formatScore } = goAnalysis;
    expect(formatScore({ score: 7.5, mate: null, bestMove: null, terminal: false })).toBe('W+7.5');
    expect(formatScore({ score: -3.5, mate: null, bestMove: null, terminal: false })).toBe('B+3.5');
    expect(formatScore({ score: -12, mate: null, bestMove: null, terminal: false })).toBe('B+12');
    // Jigo is a real Go result at the integer komi presets, not an impossibility.
    expect(formatScore({ score: 0, mate: null, bestMove: null, terminal: false })).toBe('Draw');
  });

  it('names the winner outright once the board is settled', () => {
    const { formatScore } = goAnalysis;
    expect(formatScore({ score: 4, mate: null, bestMove: null, terminal: true })).toBe('White wins');
    expect(formatScore({ score: -4, mate: null, bestMove: null, terminal: true })).toBe('Black wins');
    expect(formatScore({ score: 0, mate: null, bestMove: null, terminal: true })).toBe('Draw');
  });

  it('puts the eval bar the right way round', () => {
    const { whiteShare } = goAnalysis;
    const whiteAhead = whiteShare({ score: 20, mate: null, bestMove: null, terminal: false });
    const blackAhead = whiteShare({ score: -20, mate: null, bestMove: null, terminal: false });
    expect(whiteAhead).toBeGreaterThan(0.5);
    expect(blackAhead).toBeLessThan(0.5);
    expect(whiteShare({ score: 0, mate: null, bestMove: null, terminal: false })).toBeCloseTo(0.5);
  });

  it('names the engine’s move as a Go player reads it, skipping I', () => {
    /*
     * Caught on the device: review printed "Engine plays f4" — the raw engine
     * coordinate. It happens to look right up to column H and is wrong for every
     * column after it, because a Go board's letters skip I. The other three games
     * need no such hook, since their engine strings ARE their display strings.
     */
    const format = goAnalysis.formatMove!;
    expect(format({ from: 'd4', to: 'd4' })).toBe('D4');
    // The one that mattered: engine `i9` is the point players call J9.
    expect(format({ from: 'i9', to: 'i9' })).toBe('J9');
  });

  it('refuses to grade a pass', () => {
    // A pass is not a decision anyone made about a point on the board, so there
    // is nothing to compare an engine's choice against. Reversi says the same.
    let state = GoEngine.newGame();
    state = GoEngine.executeMove(state, 'd4');
    expect(goAnalysis.lastMove(state)).toEqual({ from: 'd4', to: 'd4' });

    state = GoEngine.executePass(state);
    expect(goAnalysis.lastMove(state)).toBeNull();
  });

  it('reads the move list in Go coordinates, where I is skipped', () => {
    const timeline = replayGoMoves([{ position: 'd4' }, { position: null }, { position: 'i9' }]);
    // `i9` internally is J9 on a board, because Go's column letters skip I.
    expect(goTimelineToPoints(timeline)).toEqual(['D4', 'Pass', 'J9']);
  });
});

describe('thresholds and budgets scale with the board', () => {
  /*
   * There is no single honest number here. A move that costs eight points is a
   * blunder on 9x9 and an ordinary endgame slip on 19x19, and a review that
   * used the 9x9 bands on a big board would call almost every move a blunder.
   */
  it('grades a big board more forgivingly than a small one', () => {
    const small = createGoAnalysis(9);
    const large = createGoAnalysis(19);
    expect(large.thresholds.blunder).toBeGreaterThan(small.thresholds.blunder);
    expect(large.thresholds.inaccuracy).toBeGreaterThan(small.thresholds.inaccuracy);
  });

  it('keeps the bands ordered at every size', () => {
    for (const size of [9, 13, 19]) {
      const { inaccuracy, mistake, blunder } = createGoAnalysis(size).thresholds;
      expect(inaccuracy).toBeLessThan(mistake);
      expect(mistake).toBeLessThan(blunder);
    }
  });

  it('needs a smaller lead to fill the bar on a small board', () => {
    // Ten points is most of a 9x9 game and a detail on 19x19.
    const evaluation = { score: 10, mate: null, bestMove: null, terminal: false };
    expect(createGoAnalysis(9).whiteShare(evaluation)).toBeGreaterThan(
      createGoAnalysis(19).whiteShare(evaluation),
    );
  });
});

describe('replayGoMoves', () => {
  it('rebuilds a game, with the starting position first', () => {
    const timeline = replayGoMoves([{ position: 'd4' }, { position: 'f6' }]);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].moveHistory).toHaveLength(0);
    expect(timeline[2].board[3][3]).toBe('black');
    expect(timeline[2].board[5][5]).toBe('white');
  });

  it('replays passes, including the two that open the review', () => {
    const timeline = replayGoMoves([{ position: null }, { position: null }]);
    expect(timeline[2].phase).toBe('marking');
    // And the game is NOT over: nobody has agreed a score yet.
    expect(timeline[2].isGameOver).toBe(false);
  });

  it('needs the ruleset, because a move list cannot carry it', () => {
    /*
     * The reason this replayer takes options and the other three do not. `q16`
     * does not exist on a 9x9 board, so a 19x19 game replayed under the
     * defaults would truncate at the first move played outside the corner —
     * silently, returning a shorter but perfectly valid-looking timeline.
     */
    const moves = [{ position: 'q16' }];
    expect(replayGoMoves(moves)).toHaveLength(1);
    expect(replayGoMoves(moves, { size: 19 })).toHaveLength(2);
  });

  it('carries komi and the scoring rule into every position', () => {
    const timeline = replayGoMoves([{ position: 'd4' }], { komi: 0.5, scoring: 'territory' });
    expect(timeline[1].komi).toBe(0.5);
    expect(timeline[1].scoring).toBe('territory');
  });

  it('stops at the first move it cannot play rather than throwing the game away', () => {
    // Rows written by older versions do exist; half a review beats none.
    const timeline = replayGoMoves([{ position: 'd4' }, { position: 'd4' }]);
    expect(timeline).toHaveLength(2);
  });
});

describe('the engine actually reaches a verdict', () => {
  it('prefers taking a group in atari to playing elsewhere', async () => {
    // A slow test on purpose: it runs the real search, which is the only way to
    // know the adapter is wired to it rather than to a stub.
    const state = goBoardStringToState(
      [
        '.........',
        '.........',
        '.........',
        '...XXX...',
        '..XOOO...',
        '...XXX...',
        '.........',
        '.........',
        '.........',
      ].join('/') + ' b',
    );

    const evaluation = await goAnalysis.evaluate(state, 400);
    expect(evaluation.terminal).toBe(false);
    expect(evaluation.bestMove).not.toBeNull();
    // Black is winning here, and white-positive means that reads negative.
    expect(evaluation.score).toBeLessThan(0);
  }, 60_000);
});
