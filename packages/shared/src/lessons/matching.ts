/**
 * Does this move answer the step?
 *
 * Game-agnostic on top of the two `PuzzleRules` methods Phase 1 added —
 * `legalMoves` and `describeMove` — so a lesson can say "make any knight move"
 * or "capture something" without the matcher knowing which game it is, and
 * without the author enumerating the answers by hand.
 *
 * Pure and synchronous, with no search anywhere: the heaviest thing here is one
 * `describeMove` per candidate, which is a validate-and-diff rather than a
 * lookahead. That is what keeps a lesson cheap on a phone.
 */

import type { PuzzleMove, PuzzleRules } from '../puzzles/types';
import type { LessonExpectation, LessonMoveMatch } from './types';

/**
 * Try the move as given, and — for a chess pawn arriving on the back rank
 * without a piece named — as a queen promotion.
 *
 * `chessPuzzleRules.validateMove` deliberately reports the intermediate "which
 * piece?" state as `{ valid: false }`, because the board is still asking. A
 * board that auto-queens, or a test that spells a move as `e7e8`, would
 * otherwise be told a perfectly legal move is illegal. `describeMove` already
 * auto-queens for the same reason, so this only makes the two agree.
 */
export function normalizeMove<S>(
  rules: PuzzleRules<S>,
  state: S,
  move: PuzzleMove,
): PuzzleMove | null {
  if (rules.validateMove(state, move).valid) return move;
  if (rules.game === 'chess' && move.promotion === undefined) {
    const queened: PuzzleMove = { ...move, promotion: 'queen' };
    if (rules.validateMove(state, queened).valid) return queened;
  }
  return null;
}

/**
 * Does this legal move have the shape the author asked for?
 *
 * Every present field is a conjunct. An illegal move is never a match rather
 * than an error: this is asked about whatever the learner played, and a board
 * can hand up something the position refuses.
 */
export function matchesMove<S>(
  rules: PuzzleRules<S>,
  state: S,
  move: PuzzleMove,
  match: LessonMoveMatch,
): boolean {
  const legal = normalizeMove(rules, state, move);
  if (!legal) return false;

  if (match.from !== undefined && legal.from !== match.from) return false;
  if (match.to !== undefined && legal.to !== match.to) return false;
  if (match.fromAnyOf && !match.fromAnyOf.includes(legal.from)) return false;
  if (match.toAnyOf && !match.toAnyOf.includes(legal.to)) return false;

  // Only pay for the engine's account of the move when something asks about it.
  if (match.piece === undefined && match.captures === undefined && match.check === undefined) {
    return true;
  }

  const facts = rules.describeMove(state, legal);
  if (match.piece !== undefined && facts.piece !== match.piece) return false;
  if (match.check !== undefined && facts.check !== match.check) return false;
  if (match.captures !== undefined) {
    if (typeof match.captures === 'boolean') {
      if (match.captures !== facts.captures > 0) return false;
    } else if (facts.captures !== match.captures) {
      return false;
    }
  }
  return true;
}

/**
 * Every move this step accepts.
 *
 * For `move` and `best` that is the authored list, parsed — legality is the
 * content gate's job, not this function's, and returning nothing for a
 * mis-authored move string would turn a build failure into a lesson that
 * silently rejects its own answer. For `any` it is a filtered enumeration of
 * the position's legal moves, which is also how the gate proves such a step
 * teaches anything: a step that accepts *every* legal move is a Continue button
 * wearing a board.
 *
 * A `read` step accepts nothing, which is the honest answer and what makes
 * `offerMove` ignore stray taps on one.
 */
export function enumerateAccepted<S>(
  rules: PuzzleRules<S>,
  state: S,
  expect: LessonExpectation,
): PuzzleMove[] {
  switch (expect.kind) {
    case 'read':
      return [];
    case 'move':
    case 'best':
      return expect.moves.map((m) => rules.parseMove(m));
    case 'any':
      return rules.legalMoves(state).filter((m) => matchesMove(rules, state, m, expect.match));
  }
}

/** Does the learner's move answer this step? */
export function matchesExpectation<S>(
  rules: PuzzleRules<S>,
  state: S,
  move: PuzzleMove,
  expect: LessonExpectation,
): boolean {
  switch (expect.kind) {
    case 'read':
      return false;
    case 'move':
    case 'best':
      // Through `sameMove` rather than string equality, because "the same move"
      // is a per-game question: checkers ignores the chain path a jump was
      // spelled with, and reversi has no origin square.
      return expect.moves.some((m) => rules.sameMove(move, rules.parseMove(m)));
    case 'any':
      return matchesMove(rules, state, move, expect.match);
  }
}

/** Is this one of the moves the author named, in `LessonMiss.when` or elsewhere? */
export function isOneOf<S>(rules: PuzzleRules<S>, move: PuzzleMove, moves: string[]): boolean {
  return moves.some((m) => {
    try {
      return rules.sameMove(move, rules.parseMove(m));
    } catch {
      // A malformed move string is a content bug the gate catches. Here it must
      // not take the screen down with it.
      return false;
    }
  });
}
