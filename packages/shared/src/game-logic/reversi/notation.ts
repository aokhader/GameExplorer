// Standard reversi move notation — the square a disc was placed on, nothing else.
//
// The convention is Hasegawa's, as set out in Brian Rose's book "Othello: A
// Minute to Learn… A Lifetime to Master" (cited by title for provenance; the
// notation itself is the field's standard and carries no brand):
// columns 'a'–'h' left to right, rows '1'–'8' TOP TO BOTTOM, written as a
// lowercase letter followed by a number, so 'a1' is the upper-left corner. The
// engine's own position strings already follow this — the opening position it
// builds is black on d5/e4 and white on d4/e5, exactly as the book states — so
// a move's square needs no translation.

import type { ReversiMove } from './types';

/** Shown for a turn that was skipped; the engine stores those as a null square. */
export const PASS_NOTATION = '—';

/**
 * Reversi notation for one move — just the square played.
 *
 * Flips are deliberately not encoded: a transcript is replayed by applying the
 * rules to each square in turn, so the flipped discs are derivable and listing
 * them would only add noise.
 */
export function toReversiMove(move: ReversiMove): string {
  return move.position ?? PASS_NOTATION;
}

/** Reversi notation for a whole game, one string per turn (passes included). */
export function moveHistoryToReversi(moves: ReversiMove[]): string[] {
  return moves.map(toReversiMove);
}
