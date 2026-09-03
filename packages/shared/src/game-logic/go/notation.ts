/**
 * Go coordinates as players read them: `D4`, `J9`, `Pass`.
 *
 * Go's display convention skips the letter **I** — it was dropped to stop it
 * being misread as a 1 or an l, and every board, book and server since has kept
 * the gap. So a 9×9 board's columns are labelled A B C D E F G H **J**, and the
 * ninth column is J, not I.
 *
 * The engine's own position strings are the app-wide `letter + rank` form with
 * no gap (`a1`..`i9`), the same convention chess, checkers and reversi use, so
 * that one shared assumption holds across every board in the app. This module
 * is the **only** place the two are translated, in either direction.
 */

import type { GoMove } from './types';
import { positionToCoordinates } from './utils';

/**
 * Shown for a passed turn; the engine stores those as a null position.
 *
 * Named with the game prefix because `@finesse/shared` is one flat barrel
 * and reversi already exports a `PASS_NOTATION` of its own — a duplicate star
 * export is dropped silently rather than reported.
 */
export const GO_PASS_NOTATION = 'Pass';

/** Column letters in display order — note the missing I. */
const DISPLAY_LETTERS = 'ABCDEFGHJKLMNOPQRST';

/** Display label for a zero-based column index: 0 → 'A', 8 → 'J'. */
export function goColumnLabel(col: number): string {
  return DISPLAY_LETTERS[col] ?? '?';
}

/** Zero-based column index for a display letter: 'A' → 0, 'J' → 8. */
export function goColumnIndex(label: string): number {
  return DISPLAY_LETTERS.indexOf(label.toUpperCase());
}

/** Internal position → display coordinate. `'i9'` → `'J9'`. */
export function toGoPoint(position: string): string {
  const { row, col } = positionToCoordinates(position);
  return goColumnLabel(col) + (row + 1);
}

/** Display coordinate → internal position. `'J9'` → `'i9'`. */
export function fromGoPoint(point: string): string {
  const col = goColumnIndex(point[0]);
  const rank = parseInt(point.slice(1), 10);
  return String.fromCharCode('a'.charCodeAt(0) + col) + rank;
}

/**
 * One move in Go notation — the point played, or `Pass`.
 *
 * Captures are deliberately not encoded: a transcript is replayed by applying
 * the rules to each point in turn, so which stones came off is derivable.
 */
export function toGoMove(move: GoMove): string {
  return move.position === null ? GO_PASS_NOTATION : toGoPoint(move.position);
}

/** A whole game in Go notation, one string per turn (passes included). */
export function moveHistoryToGo(moves: GoMove[]): string[] {
  return moves.map(toGoMove);
}
