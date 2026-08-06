// The three games' comparators, bound once.
//
// `diffBoards` is deliberately game-agnostic; these are the only three ways we
// ever call it, and having them in one place is what stops six renderers from
// each inventing their own notion of "the same piece" — which is exactly the
// kind of drift that would make chess animate correctly and checkers not.

import type { Piece } from '../types/chess.types';
import type { CheckersPiece } from '../game-logic/checkers/types';
import type { ReversiDisc } from '../game-logic/reversi/types';
import { type BoardTransition, type DiffOptions, diffBoards } from './transition';

/** Chess. `sameSide` lets a promoting pawn slide into its queen. */
export const CHESS_DIFF: DiffOptions<Piece> = {
  samePiece: (a, b) => a.type === b.type && a.color === b.color,
  sameSide: (a, b) => a.color === b.color,
};

/** Checkers. `sameSide` covers a man crowning on the far rank. */
export const CHECKERS_DIFF: DiffOptions<CheckersPiece> = {
  samePiece: (a, b) => a.type === b.type && a.color === b.color,
  sameSide: (a, b) => a.color === b.color,
};

export function chessTransition(
  prev: readonly (readonly (Piece | null)[])[] | null | undefined,
  next: readonly (readonly (Piece | null)[])[] | null | undefined,
): BoardTransition<Piece> {
  return diffBoards(prev, next, CHESS_DIFF);
}

export function checkersTransition(
  prev: readonly (readonly (CheckersPiece | null)[])[] | null | undefined,
  next: readonly (readonly (CheckersPiece | null)[])[] | null | undefined,
): BoardTransition<CheckersPiece> {
  return diffBoards(prev, next, CHECKERS_DIFF);
}

/**
 * Reversi. **No `sameSide` on purpose** — a disc never travels, so a pairing
 * across squares would be a lie however plausible it looked.
 *
 * Between two consecutive positions it would in fact never fire: a disc only
 * leaves the board by changing colour, so the departed are always one colour
 * and the arrived the other, and a same-side match has nothing to pair. Leaving
 * it off is therefore about saying what we mean, and about the case where the
 * two positions are *not* consecutive — a seek through history, where a
 * same-side pass really could invent a disc gliding across the board.
 */
export const REVERSI_DIFF: DiffOptions<ReversiDisc> = {
  samePiece: (a, b) => a.color === b.color,
};

export function reversiTransition(
  prev: readonly (readonly (ReversiDisc | null)[])[] | null | undefined,
  next: readonly (readonly (ReversiDisc | null)[])[] | null | undefined,
): BoardTransition<ReversiDisc> {
  return diffBoards(prev, next, REVERSI_DIFF);
}
