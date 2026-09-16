import { describe, expect, it } from 'vitest';
import { enumerateAccepted, matchesExpectation, matchesMove, normalizeMove } from './matching';
import {
  checkersPuzzleRules,
  chessPuzzleRules,
  goPuzzleRules,
  reversiPuzzleRules,
} from '../puzzles/rules';
import type { ChessGameState } from '../types/chess.types';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';
import type { GoGameState } from '../game-logic/go/types';

const OPENING = chessPuzzleRules.decode(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
);

describe('matchesMove — chess', () => {
  it('matches on piece kind', () => {
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'g1', to: 'f3' }, { piece: 'knight' })).toBe(
      true,
    );
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'e2', to: 'e4' }, { piece: 'knight' })).toBe(
      false,
    );
  });

  it('matches on destination sets', () => {
    const match = { piece: 'pawn' as const, toAnyOf: ['e4', 'd4'] };
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'e2', to: 'e4' }, match)).toBe(true);
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'a2', to: 'a4' }, match)).toBe(false);
  });

  it('matches on origin sets', () => {
    const match = { fromAnyOf: ['b1', 'g1'] };
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'b1', to: 'c3' }, match)).toBe(true);
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'e2', to: 'e4' }, match)).toBe(false);
  });

  it('matches on check', () => {
    // Scholar's-mate shape: Qh5xf7 is check, Qh5-h4 is not.
    const state = chessPuzzleRules.decode(
      'rnbqkbnr/pppp1ppp/8/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    );
    expect(matchesMove(chessPuzzleRules, state, { from: 'h5', to: 'f7' }, { check: true })).toBe(true);
    expect(matchesMove(chessPuzzleRules, state, { from: 'h5', to: 'h4' }, { check: true })).toBe(false);
  });

  it('matches on captures, as a count and as a boolean', () => {
    const state = chessPuzzleRules.decode(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
    );
    expect(matchesMove(chessPuzzleRules, state, { from: 'f3', to: 'e5' }, { captures: true })).toBe(
      true,
    );
    expect(matchesMove(chessPuzzleRules, state, { from: 'f3', to: 'e5' }, { captures: 1 })).toBe(true);
    expect(matchesMove(chessPuzzleRules, state, { from: 'f3', to: 'g5' }, { captures: true })).toBe(
      false,
    );
    expect(matchesMove(chessPuzzleRules, state, { from: 'f3', to: 'g5' }, { captures: false })).toBe(
      true,
    );
  });

  it('never matches an illegal move', () => {
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'e2', to: 'e5' }, {})).toBe(false);
    // A black move while it is white's turn is illegal too, not merely wrong.
    expect(matchesMove(chessPuzzleRules, OPENING, { from: 'e7', to: 'e5' }, {})).toBe(false);
  });
});

describe('normalizeMove', () => {
  it('fills in a queen promotion the board did not name', () => {
    const state = chessPuzzleRules.decode('8/4P3/8/8/8/8/8/K5k1 w - - 0 1');
    // `chessPuzzleRules.validateMove` reports the bare move as invalid — that is
    // the board still asking which piece — so without this a legal promotion
    // would be coached as a mistake.
    expect(chessPuzzleRules.validateMove(state, { from: 'e7', to: 'e8' }).valid).toBe(false);
    expect(normalizeMove(chessPuzzleRules, state, { from: 'e7', to: 'e8' })).toEqual({
      from: 'e7',
      to: 'e8',
      promotion: 'queen',
    });
  });

  it('returns null for a move no piece can make', () => {
    expect(normalizeMove(chessPuzzleRules, OPENING, { from: 'e4', to: 'e5' })).toBeNull();
  });
});

describe('matchesMove — checkers', () => {
  const state = checkersPuzzleRules.decode('W:W26,27,32:B18,19') as CheckersGameState;

  it('reads the piece as it stood before the move', () => {
    const moves = checkersPuzzleRules.legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(matchesMove(checkersPuzzleRules, state, moves[0], { piece: 'man' })).toBe(true);
    expect(matchesMove(checkersPuzzleRules, state, moves[0], { piece: 'king' })).toBe(false);
  });

  it('counts jumped pieces as captures', () => {
    // After f2e3 black is forced to jump — checkers has no quiet alternative
    // once a capture exists, which is why this position has to be reached
    // rather than declared.
    const forced = checkersPuzzleRules.validateMove(state, { from: 'f2', to: 'e3' })
      .resultingState as CheckersGameState;
    const jumps = checkersPuzzleRules
      .legalMoves(forced)
      .filter((m) => matchesMove(checkersPuzzleRules, forced, m, { captures: true }));
    expect(jumps.length).toBeGreaterThan(0);
    for (const jump of jumps) {
      expect(checkersPuzzleRules.describeMove(forced, jump).captures).toBeGreaterThan(0);
    }
  });
});

describe('matchesMove — reversi', () => {
  const state = reversiPuzzleRules.decode(
    '......../......../......../...OX.../...XO.../......../......../........ b',
  ) as ReversiGameState;

  it('reports discs flipped as this game’s captures', () => {
    // Every opening move in reversi flips exactly one disc.
    for (const move of reversiPuzzleRules.legalMoves(state)) {
      expect(matchesMove(reversiPuzzleRules, state, move, { captures: 1 })).toBe(true);
      expect(matchesMove(reversiPuzzleRules, state, move, { captures: true })).toBe(true);
    }
  });

  it('calls the placed piece a disc', () => {
    const move = reversiPuzzleRules.legalMoves(state)[0];
    expect(matchesMove(reversiPuzzleRules, state, move, { piece: 'disc' })).toBe(true);
    expect(matchesMove(reversiPuzzleRules, state, move, { piece: 'stone' })).toBe(false);
  });
});

describe('matchesMove — go', () => {
  const state = goPuzzleRules.decode(
    '........./........./........./........./........./........./........./........./.........  b',
  ) as GoGameState;

  it('calls the placed piece a stone', () => {
    expect(matchesMove(goPuzzleRules, state, { from: 'e5', to: 'e5' }, { piece: 'stone' })).toBe(true);
  });

  it('counts captured stones', () => {
    // A single white stone on a1 whose last liberty is b1: a2 is already black.
    const atari = goPuzzleRules.decode(
      '........./........./........./........./........./........./........./X......../O........ b',
    ) as GoGameState;
    expect(matchesMove(goPuzzleRules, atari, { from: 'b1', to: 'b1' }, { captures: 1 })).toBe(true);
    expect(matchesMove(goPuzzleRules, atari, { from: 'e5', to: 'e5' }, { captures: true })).toBe(
      false,
    );
  });
});

describe('enumerateAccepted', () => {
  it('parses an authored list without consulting the position', () => {
    const moves = enumerateAccepted(chessPuzzleRules, OPENING, {
      kind: 'move',
      moves: ['e2e4', 'd2d4'],
    });
    expect(moves).toEqual([
      { from: 'e2', to: 'e4', promotion: undefined },
      { from: 'd2', to: 'd4', promotion: undefined },
    ]);
  });

  it('filters the legal moves for an `any` step', () => {
    const knights = enumerateAccepted(chessPuzzleRules, OPENING, {
      kind: 'any',
      match: { piece: 'knight' },
    });
    // Na3, Nc3, Nf3, Nh3 — and nothing else.
    expect(knights.map((m) => `${m.from}${m.to}`).sort()).toEqual([
      'b1a3',
      'b1c3',
      'g1f3',
      'g1h3',
    ]);
  });

  it('accepts nothing on a read step', () => {
    expect(enumerateAccepted(chessPuzzleRules, OPENING, { kind: 'read' })).toEqual([]);
  });
});

describe('matchesExpectation', () => {
  it('compares a `move` step through the game’s own sameMove', () => {
    const expect_ = { kind: 'move' as const, moves: ['e2e4'] };
    expect(matchesExpectation(chessPuzzleRules, OPENING, { from: 'e2', to: 'e4' }, expect_)).toBe(
      true,
    );
    expect(matchesExpectation(chessPuzzleRules, OPENING, { from: 'd2', to: 'd4' }, expect_)).toBe(
      false,
    );
  });

  it('treats a `best` step as its cached list — the runtime never searches', () => {
    const expect_ = { kind: 'best' as const, moves: ['g1f3'], depth: 4 };
    expect(matchesExpectation(chessPuzzleRules, OPENING, { from: 'g1', to: 'f3' }, expect_)).toBe(
      true,
    );
  });

  it('accepts nothing on a read step', () => {
    expect(
      matchesExpectation(chessPuzzleRules as unknown as typeof chessPuzzleRules, OPENING, {
        from: 'e2',
        to: 'e4',
      }, { kind: 'read' }),
    ).toBe(false);
  });
});

// Kept last: it is the one assertion here that is about the whole file rather
// than one function — every game answers every field, so a lesson author can
// write `{ piece: … }` without asking which game they are in.
describe('the four games all answer describeMove', () => {
  const cases: Array<[string, () => boolean]> = [
    ['chess', () => matchesMove(chessPuzzleRules, OPENING as ChessGameState, { from: 'e2', to: 'e4' }, { piece: 'pawn', captures: false, check: false })],
    [
      'checkers',
      () => {
        const state = checkersPuzzleRules.decode('W:W26,27,32:B18,19');
        const move = checkersPuzzleRules.legalMoves(state)[0];
        return matchesMove(checkersPuzzleRules, state, move, { check: false });
      },
    ],
    [
      'reversi',
      () => {
        const state = reversiPuzzleRules.decode(
          '......../......../......../...OX.../...XO.../......../......../........ b',
        );
        return matchesMove(reversiPuzzleRules, state, { from: 'd6', to: 'd6' }, { check: false });
      },
    ],
    [
      'go',
      () => {
        const state = goPuzzleRules.decode(
          '........./........./........./........./........./........./........./........./......... b',
        );
        return matchesMove(goPuzzleRules, state, { from: 'e5', to: 'e5' }, { check: false });
      },
    ],
  ];

  it.each(cases)('%s', (_game, run) => {
    expect(run()).toBe(true);
  });
});
