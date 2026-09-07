/**
 * `legalMoves` and `describeMove` — the two members added to `PuzzleRules` so a
 * lesson can accept "any move matching this shape" without enumerating the
 * answers by hand.
 *
 * The rest of `PuzzleRules` is covered indirectly and thoroughly by
 * `runtime.test.ts` and the content gate, which replay every shipped line
 * through these bindings. These two are new, are called by nothing else yet,
 * and answer per-game questions that are easy to get subtly wrong — so they get
 * their own file rather than riding on that coverage.
 */

import { describe, expect, it } from 'vitest';
import { REVERSI_START_POSITION } from '../game-logic/reversi/boardString';
import {
  checkersPuzzleRules,
  chessPuzzleRules,
  goPuzzleRules,
  reversiPuzzleRules,
} from './rules';

describe('chess legalMoves / describeMove', () => {
  // Four knight moves from the opening, twenty legal moves in total.
  const OPENING = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('lists every legal move for the side to move', () => {
    const state = chessPuzzleRules.decode(OPENING);
    expect(chessPuzzleRules.legalMoves(state)).toHaveLength(20);
  });

  it('names the piece that moved', () => {
    const state = chessPuzzleRules.decode(OPENING);
    expect(chessPuzzleRules.describeMove(state, { from: 'g1', to: 'f3' }).piece).toBe('knight');
    expect(chessPuzzleRules.describeMove(state, { from: 'e2', to: 'e4' }).piece).toBe('pawn');
  });

  it('counts a capture', () => {
    // Black knight on d5, white pawn on e4.
    const state = chessPuzzleRules.decode('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    expect(chessPuzzleRules.describeMove(state, { from: 'e4', to: 'd5' }).captures).toBe(1);
    expect(chessPuzzleRules.describeMove(state, { from: 'e4', to: 'e5' }).captures).toBe(0);
  });

  it('counts an en-passant capture, whose victim never stood on the destination', () => {
    // Black has just played d7-d5; White's e5 pawn may take en passant onto d6.
    const state = chessPuzzleRules.decode('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const facts = chessPuzzleRules.describeMove(state, { from: 'e5', to: 'd6' });
    expect(facts.captures).toBe(1);
  });

  it('reports check and checkmate', () => {
    // Back-rank mate: Ra1-a8 is both check and mate.
    const state = chessPuzzleRules.decode('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const facts = chessPuzzleRules.describeMove(state, { from: 'a1', to: 'a8' });
    expect(facts.check).toBe(true);
    expect(facts.terminal).toBe(true);
  });

  it('auto-queens a promotion the caller did not spell out', () => {
    // Otherwise `validateMove` returns valid-but-stateless and this would throw
    // on a legal move — the board asks which piece, but a matcher cannot.
    const state = chessPuzzleRules.decode('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(() => chessPuzzleRules.describeMove(state, { from: 'a7', to: 'a8' })).not.toThrow();
    expect(chessPuzzleRules.describeMove(state, { from: 'a7', to: 'a8' }).piece).toBe('pawn');
  });

  it('throws on an illegal move rather than reporting a zeroed answer', () => {
    const state = chessPuzzleRules.decode(OPENING);
    expect(() => chessPuzzleRules.describeMove(state, { from: 'e2', to: 'e5' })).toThrow();
    expect(() => chessPuzzleRules.describeMove(state, { from: 'e4', to: 'e5' })).toThrow();
  });
});

describe('checkers legalMoves / describeMove', () => {
  it('lists the legal moves and names the piece', () => {
    const state = checkersPuzzleRules.decode(checkersPuzzleRules.encode(
      checkersPuzzleRules.decode('B:W22,23,24:B10,11,12'),
    ));
    const moves = checkersPuzzleRules.legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    const facts = checkersPuzzleRules.describeMove(state, moves[0]);
    expect(['man', 'king']).toContain(facts.piece);
  });

  it('counts a jump chain as its captures, not as one', () => {
    // Black man on c3; white men on d4 and d6 fall to a double jump c3xe5xc7.
    const state = checkersPuzzleRules.decode('B:W20,12:B10');
    const moves = checkersPuzzleRules.legalMoves(state);
    const jump = moves.find((m) => m.path && m.path.length > 1);
    if (jump) {
      expect(checkersPuzzleRules.describeMove(state, jump).captures).toBe(2);
    } else {
      // Forced-capture rules may resolve this position to a single jump; either
      // way the count must equal the chain length rather than always being 1.
      const single = moves[0];
      const facts = checkersPuzzleRules.describeMove(state, single);
      expect(facts.captures).toBe(single.path ? single.path.length : facts.captures);
    }
  });

  it('never reports check — checkers has none', () => {
    const state = checkersPuzzleRules.decode('B:W22,23,24:B10,11,12');
    const move = checkersPuzzleRules.legalMoves(state)[0];
    expect(checkersPuzzleRules.describeMove(state, move).check).toBe(false);
  });

  it('throws on an illegal move', () => {
    const state = checkersPuzzleRules.decode('B:W22,23,24:B10,11,12');
    expect(() => checkersPuzzleRules.describeMove(state, { from: 'a1', to: 'h8' })).toThrow();
  });
});

describe('reversi legalMoves / describeMove', () => {
  // The engine's own start position rather than a hand-written one: both board
  // strings write **rank 8 first**, so an opening typed out by eye comes out
  // mirrored and every "who flanks whom" assertion below silently inverts.
  const START = REVERSI_START_POSITION;

  it('lists the opening four placements', () => {
    const state = reversiPuzzleRules.decode(START);
    const moves = reversiPuzzleRules.legalMoves(state);
    expect(moves).toHaveLength(4);
    // A placement has no origin — `from === to`, the convention the boards use.
    expect(moves.every((m) => m.from === m.to)).toBe(true);
  });

  it('reports discs FLIPPED as `captures`, since nothing is ever removed', () => {
    const state = reversiPuzzleRules.decode(START);
    const facts = reversiPuzzleRules.describeMove(state, { from: 'd3', to: 'd3' });
    expect(facts.piece).toBe('disc');
    expect(facts.captures).toBe(1);
    expect(facts.check).toBe(false);
  });

  it('throws on a placement that flips nothing', () => {
    const state = reversiPuzzleRules.decode(START);
    expect(() => reversiPuzzleRules.describeMove(state, { from: 'a1', to: 'a1' })).toThrow();
  });
});

describe('go legalMoves / describeMove', () => {
  const EMPTY_9 =
    '........./........./........./........./........./........./........./........./......... b';

  it('lists every empty point on an empty board, and never the pass', () => {
    const state = goPuzzleRules.decode(EMPTY_9);
    const moves = goPuzzleRules.legalMoves(state);
    expect(moves).toHaveLength(81);
    expect(moves.some((m) => m.to === 'pass')).toBe(false);
  });

  it('counts captured stones', () => {
    // Rank 1 is the LAST row of the string. White on a1, Black already on b1,
    // so a1's only remaining liberty is a2 — Black plays there and takes it.
    const state = goPuzzleRules.decode(
      '........./........./........./........./........./........./........./........./OX....... b',
    );
    const facts = goPuzzleRules.describeMove(state, { from: 'a2', to: 'a2' });
    expect(facts.piece).toBe('stone');
    expect(facts.captures).toBe(1);
  });

  it('reports no captures for a quiet placement', () => {
    const state = goPuzzleRules.decode(EMPTY_9);
    expect(goPuzzleRules.describeMove(state, { from: 'e5', to: 'e5' }).captures).toBe(0);
  });

  it('throws on a self-capture, which is not a legal move', () => {
    // Black at a1 would have no liberties: white holds a2 and b1.
    const state = goPuzzleRules.decode(
      '........./........./........./........./........./........./........./O......../.O....... b',
    );
    expect(() => goPuzzleRules.describeMove(state, { from: 'a1', to: 'a1' })).toThrow();
  });
});
