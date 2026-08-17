import { describe, it, expect } from 'vitest';
import { TUTORIALS } from './index';
import type { GameTutorial, TutorialDiagram } from './types';
// All three games share the same 'a1'..'h8' coordinate math; checkers utils take plain strings.
import {
  positionToCoordinates,
  isValidCoordinates,
  isDarkSquare,
  createInitialBoard as createInitialCheckersBoard,
} from '../../game-logic/checkers/utils';
import { createInitialBoard as createInitialReversiBoard } from '../../game-logic/reversi/utils';
import { createInitialGameState as createInitialChessState } from '../../game-logic/chess/utils';
import { GoEngine } from '../../game-logic/go/engine';
import { getGroup, isSingleSpaceEye } from '../../game-logic/go/moves';
import {
  boardKey as goBoardKey,
  positionToCoordinates as goPositionToCoordinates,
} from '../../game-logic/go/utils';
import type { GoColor, GoGameState } from '../../game-logic/go/types';
import {
  DOUBLES_LIMIT,
  FULL_SYSTEM_RENT_MULTIPLIER,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  MAX_IMPOUND_TURNS,
  MORTGAGE_RATE,
  mortgageValueFor,
  unmortgageCostFor,
} from '../../game-logic/liquidate/economy';

function allDiagrams(tutorial: GameTutorial): TutorialDiagram[] {
  return tutorial.sections.flatMap(s => s.diagrams ?? []);
}

function allSquares(diagram: TutorialDiagram): string[] {
  return [
    ...diagram.pieces.map(p => p.square),
    ...(diagram.highlights ?? []).map(h => h.square),
    ...(diagram.arrows ?? []).flatMap(a => [a.from, a.to]),
  ];
}

const tutorials = Object.values(TUTORIALS);

describe('tutorial content integrity', () => {
  it('every tutorial has sections, 3-5 tips, and a CTA label', () => {
    for (const tutorial of tutorials) {
      expect(tutorial.sections.length).toBeGreaterThan(0);
      expect(tutorial.tips.length).toBeGreaterThanOrEqual(3);
      expect(tutorial.tips.length).toBeLessThanOrEqual(5);
      expect(tutorial.ctaLabel.length).toBeGreaterThan(0);
      for (const section of tutorial.sections) {
        expect(section.id).toMatch(/^[a-z-]+$/);
        expect(section.paragraphs.length).toBeGreaterThan(0);
      }
    }
  });

  it('section ids are unique within each tutorial', () => {
    for (const tutorial of tutorials) {
      const ids = tutorial.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  /**
   * Liquidate has no diagrams (a ring board has no 8×8 equivalent), so its claims
   * are pinned against the engine's constants instead — the same intent as the
   * per-game rule checks below: the prose must not drift from the code.
   */
  describe('liquidate tutorial matches the engine', () => {
    const tutorial = TUTORIALS.liquidate;
    const text = [
      tutorial.intro,
      ...tutorial.sections.flatMap(s => [s.heading, ...s.paragraphs]),
      ...tutorial.tips,
    ]
      .join(' ')
      .toLowerCase();

    it('carries no diagrams', () => {
      expect(allDiagrams(tutorial)).toHaveLength(0);
    });

    it('states the real player range', () => {
      expect(text).toContain('two to six players');
      expect(LIQUIDATE_MIN_PLAYERS).toBe(2);
      expect(LIQUIDATE_MAX_PLAYERS).toBe(6);
    });

    it('describes the doubles rule the engine enforces', () => {
      expect(DOUBLES_LIMIT).toBe(3);
      expect(text).toMatch(/three doubles in a row/);
    });

    it('describes the real mortgage terms', () => {
      expect(mortgageValueFor(200)).toBe(200 * MORTGAGE_RATE);
      expect(text).toMatch(/half its list price/);
      expect(unmortgageCostFor(200)).toBeGreaterThan(mortgageValueFor(200));
      expect(text).toMatch(/plus interest/);
    });

    it('describes the full-system rent bonus the engine applies', () => {
      expect(FULL_SYSTEM_RENT_MULTIPLIER).toBe(2);
      expect(text).toMatch(/doubles/);
    });

    it('describes the impound escape routes the engine offers', () => {
      expect(MAX_IMPOUND_TURNS).toBe(3);
      expect(text).toMatch(/pay the release fee/);
      expect(text).toMatch(/roll doubles/);
      expect(text).toMatch(/clearance pass/);
    });

    it('names both event decks', () => {
      expect(text).toContain('anomal');
      expect(text).toContain('federation');
    });

    it('explains both debt rules the setup screen offers', () => {
      expect(text).toMatch(/below zero/);
      expect(text).toMatch(/never lets a balance go below zero/);
    });

    it('avoids the trademarked vocabulary entirely', () => {
      // The legal strategy is mechanics-only; none of this brand language may appear.
      for (const banned of [
        'monopoly',
        'opoly',
        'community chest',
        'get out of jail',
        'boardwalk',
        'park place',
        'hotel',
        'houses',
      ]) {
        expect(text, `tutorial must not use "${banned}"`).not.toContain(banned);
      }
    });
  });

  it('every diagram square is on the board', () => {
    for (const tutorial of tutorials) {
      for (const diagram of allDiagrams(tutorial)) {
        for (const square of allSquares(diagram)) {
          // Go is the one game here that is not 8×8: its diagrams declare their
          // own size and its files run a–i, so it gets its own bound.
          if (diagram.game === 'go') {
            const last = String.fromCharCode('a'.charCodeAt(0) + diagram.size - 1);
            expect(square, `go: bad point '${square}'`).toMatch(
              new RegExp(`^[a-${last}][1-${diagram.size}]$`),
            );
            continue;
          }
          expect(square, `${tutorial.game}: bad square '${square}'`).toMatch(/^[a-h][1-8]$/);
          expect(isValidCoordinates(positionToCoordinates(square))).toBe(true);
        }
      }
    }
  });

  it('no diagram places two pieces on the same square', () => {
    for (const tutorial of tutorials) {
      for (const diagram of allDiagrams(tutorial)) {
        const squares = diagram.pieces.map(p => p.square);
        expect(new Set(squares).size, `${tutorial.game}: '${diagram.caption}'`).toBe(squares.length);
      }
    }
  });

  it('every diagram declares the same game as its tutorial and has a caption', () => {
    for (const tutorial of tutorials) {
      for (const diagram of allDiagrams(tutorial)) {
        expect(diagram.game).toBe(tutorial.game);
        expect(diagram.caption.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('checkers diagrams', () => {
  it('places every piece on a dark square', () => {
    for (const diagram of allDiagrams(TUTORIALS.checkers)) {
      if (diagram.game !== 'checkers') continue;
      for (const piece of diagram.pieces) {
        const { row, col } = positionToCoordinates(piece.square);
        expect(isDarkSquare(row, col), `'${piece.square}' is a light square`).toBe(true);
      }
    }
  });

  it('setup diagram matches the engine starting position', () => {
    const diagram = TUTORIALS.checkers.sections.find(s => s.id === 'setup')?.diagrams?.[0];
    expect(diagram?.game).toBe('checkers');
    if (diagram?.game !== 'checkers') return;

    const board = createInitialCheckersBoard();
    expect(diagram.pieces.length).toBe(24);
    for (const p of diagram.pieces) {
      const { row, col } = positionToCoordinates(p.square);
      expect(board[row][col], `expected a piece on ${p.square}`).toEqual({ type: p.piece, color: p.color });
    }
  });
});

describe('chess setup diagram', () => {
  it('matches the engine starting position', () => {
    const diagram = TUTORIALS.chess.sections.find(s => s.id === 'setup')?.diagrams?.[0];
    expect(diagram?.game).toBe('chess');
    if (diagram?.game !== 'chess') return;

    const board = createInitialChessState().board;
    expect(diagram.pieces.length).toBe(32);
    for (const p of diagram.pieces) {
      const { row, col } = positionToCoordinates(p.square);
      expect(board[row][col], `expected a piece on ${p.square}`).toEqual({ type: p.piece, color: p.color });
    }
  });
});

/**
 * Every claim the Go tutorial makes about a diagram, checked against the real
 * engine. This is the whole point of authoring tutorials as data: the prose says
 * "the white stone has one liberty" and "white may not retake straight away",
 * and here those are assertions rather than hopes.
 */
describe('go diagrams match the engine', () => {
  /** Build a game state from a diagram's stones, with `turn` to move. */
  function stateFromDiagram(sectionId: string, turn: GoColor): GoGameState {
    const diagram = TUTORIALS.go.sections.find(s => s.id === sectionId)?.diagrams?.[0];
    expect(diagram?.game, `section '${sectionId}' needs a go diagram`).toBe('go');
    if (diagram?.game !== 'go') throw new Error('unreachable');

    const state = GoEngine.newGame({ size: diagram.size });
    for (const piece of diagram.pieces) {
      const { row, col } = goPositionToCoordinates(piece.square);
      state.board[row][col] = piece.color;
    }
    state.currentTurn = turn;
    state.positionKeys = [goBoardKey(state.board)];
    return state;
  }

  it('opens on the centre point of a 9x9 board', () => {
    const state = stateFromDiagram('setup', 'white');
    expect(state.size).toBe(9);
    expect(state.board[4][4]).toBe('black'); // e5 is the centre
  });

  it('leaves the white stone exactly one liberty, where the diagram points', () => {
    const state = stateFromDiagram('liberties', 'black');
    expect(getGroup(state.board, 'e5', 9)!.liberties).toEqual(['e4']);
    expect(GoEngine.validateMove(state, 'e4').valid).toBe(true);
  });

  it('captures both stones with the marked move', () => {
    const state = stateFromDiagram('capture', 'black');
    const next = GoEngine.executeMove(state, 'e7');
    expect(next.captured.black).toBe(2);
    expect(next.board[4][4]).toBeNull(); // e5
    expect(next.board[5][4]).toBeNull(); // e6
  });

  it('really is a ko: the retake is illegal, and legal again after a move elsewhere', () => {
    const state = stateFromDiagram('ko', 'black');
    const afterBlack = GoEngine.executeMove(state, 'e5');
    expect(afterBlack.captured.black).toBe(1);

    const retake = GoEngine.validateMove(afterBlack, 'd5');
    expect(retake.valid).toBe(false);
    expect(retake.reason).toMatch(/ko/i);

    let later = GoEngine.executeMove(afterBlack, 'a1');
    later = GoEngine.executeMove(later, 'a9');
    expect(GoEngine.validateMove(later, 'd5').valid).toBe(true);
  });

  it('shows a group with two real eyes', () => {
    const state = stateFromDiagram('life', 'white');
    expect(isSingleSpaceEye(state.board, 'a1', 'black', 9)).toBe(true);
    expect(isSingleSpaceEye(state.board, 'a3', 'black', 9)).toBe(true);
    // And white cannot start filling them — both are self-capture.
    expect(GoEngine.validateMove(state, 'a1').valid).toBe(false);
    expect(GoEngine.validateMove(state, 'a3').valid).toBe(false);
  });

  it('scores the counting diagram the way the caption says', () => {
    const state = stateFromDiagram('scoring', 'black');
    const score = GoEngine.score(state);
    expect(score.black).toBe(36); // 9 stones + 27 points behind the wall
    expect(score.white).toBe(36 + score.komi);
    // The file between the walls touches both, so it counts for neither.
    expect(score.black + (score.white - score.komi)).toBe(81 - 9);
  });

  it('quotes the komi the engine actually uses', () => {
    const komi = GoEngine.newGame().komi;
    const text = TUTORIALS.go.sections.flatMap(s => s.paragraphs).join(' ');
    expect(text).toContain(String(komi));
  });
});

describe('reversi setup diagram', () => {
  it('matches the engine starting position', () => {
    const diagram = TUTORIALS.reversi.sections.find(s => s.id === 'setup')?.diagrams?.[0];
    expect(diagram?.game).toBe('reversi');
    if (diagram?.game !== 'reversi') return;

    const board = createInitialReversiBoard();
    expect(diagram.pieces.length).toBe(4);
    for (const p of diagram.pieces) {
      const { row, col } = positionToCoordinates(p.square);
      expect(board[row][col], `expected a disc on ${p.square}`).toEqual({ color: p.color });
    }
  });
});
