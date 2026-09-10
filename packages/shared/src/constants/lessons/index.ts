/**
 * Coached lesson content shared by web and mobile.
 *
 * Pure serializable data — strings, numbers and arrays only, no functions and
 * no JSX — exactly like `constants/tutorials/` and `constants/puzzles/`, so it
 * can cross a Next.js RSC boundary, be parsed raw by Metro, and be the shape a
 * database row deserializes into. Every behaviour that reads this lives in
 * `lessons/`, which is the sibling module that is allowed to export functions.
 *
 * Nothing here is trusted: `lessons.test.ts` replays every lesson against the
 * real engines and fails the build on a position, a move, or a coached wrong
 * answer that does not hold up.
 */

import type { GameLessonSet, LessonGame } from '../../lessons/types';
import { CHESS_LESSONS } from './chess';
import { CHECKERS_LESSONS } from './checkers';
import { REVERSI_LESSONS } from './reversi';
import { GO_LESSONS } from './go';

export { CHESS_LESSONS, CHECKERS_LESSONS, REVERSI_LESSONS, GO_LESSONS };

/**
 * Every lesson, by game.
 *
 * A `Record` rather than an array so a new `LessonGame` fails to compile until
 * it has a set — the same compile-time completeness `PUZZLES` relies on.
 */
export const LESSONS: Record<LessonGame, GameLessonSet> = {
  chess: { game: 'chess', lessons: CHESS_LESSONS },
  checkers: { game: 'checkers', lessons: CHECKERS_LESSONS },
  reversi: { game: 'reversi', lessons: REVERSI_LESSONS },
  go: { game: 'go', lessons: GO_LESSONS },
};

/** Flat list, for anything that wants to scan the whole corpus. */
export const ALL_LESSONS = Object.values(LESSONS).flatMap((set) => set.lessons);
