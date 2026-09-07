/**
 * Puzzle content shared by web and mobile.
 *
 * Pure serializable data (strings, numbers and arrays only — no JSX, no
 * functions) so it can cross Next.js RSC boundaries and be imported raw by
 * Metro, exactly like `constants/tutorials/`.
 *
 * Every field must survive `JSON.parse(JSON.stringify(x))` unchanged — this is
 * the shape a `puzzles` table row will deserialize into, and holding the line
 * here is what lets a database source replace this module without a single
 * consumer changing. The types themselves live in `puzzles/types.ts`, because
 * this directory may not export functions.
 *
 * Nothing here is trusted: `puzzles.test.ts` replays every line against the
 * real engines and fails the build on a position, move, or goal claim that
 * doesn't hold.
 */

import type { Puzzle, PuzzleGame } from '../../puzzles/types';
import { CHESS_PUZZLES } from './chess';
import { CHECKERS_PUZZLES } from './checkers';
import { REVERSI_PUZZLES } from './reversi';
import { GO_PUZZLES } from './go';
import { CHESS_CORE_PUZZLES } from './generated/chess.core';

export { CHESS_PUZZLES, CHECKERS_PUZZLES, REVERSI_PUZZLES, GO_PUZZLES };

/**
 * What ships inside the app.
 *
 * Two layers, joined here: the **hand-authored** puzzles, which carry written
 * explanations and sort first so they are what a new player meets, and a
 * **generated core** — a fixed slice per band of the mined corpus, so every
 * difficulty band works on a fresh install that has never had a network.
 *
 * The rest of the corpus is fetched a band at a time and cached on the device
 * (`createFetchPuzzleSource`), because bundling it would put megabytes of
 * source on Metro's cold-boot path. A game with no generated core yet simply
 * ships its authored set.
 */
export const PUZZLES: Record<PuzzleGame, Puzzle[]> = {
  chess: [...CHESS_PUZZLES, ...CHESS_CORE_PUZZLES],
  checkers: CHECKERS_PUZZLES,
  reversi: REVERSI_PUZZLES,
  go: GO_PUZZLES,
};

export const ALL_PUZZLES: Puzzle[] = Object.values(PUZZLES).flat();
