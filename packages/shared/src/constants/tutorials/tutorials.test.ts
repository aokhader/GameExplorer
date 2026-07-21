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

  it('every diagram square is on the board', () => {
    for (const tutorial of tutorials) {
      for (const diagram of allDiagrams(tutorial)) {
        for (const square of allSquares(diagram)) {
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
