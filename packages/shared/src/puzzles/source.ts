/**
 * Where puzzles come from.
 *
 * **Every method returns a Promise, even in the static implementation.** A
 * sync-now/async-later source would force a change in every call site, the
 * hook, and both screens the day a database arrives; one `await` today buys
 * that swap for free. A `createSupabasePuzzleSource()` satisfying this same
 * interface is the whole of the eventual migration.
 */

import { PUZZLES } from '../constants/puzzles';
import type { Puzzle, PuzzleDifficulty, PuzzleGame } from './types';

export interface PuzzleQuery {
  game?: PuzzleGame;
  difficulty?: PuzzleDifficulty;
  /** Matches a puzzle carrying this theme tag. */
  theme?: string;
}

export interface NextPuzzleOptions {
  /** Ids to skip — usually everything the player has already solved. */
  solvedIds?: readonly string[];
  difficulty?: PuzzleDifficulty;
  /** Take the first puzzle ordered strictly after this id, for "next". */
  after?: string;
}

export interface PuzzleSource {
  getPuzzle(id: string): Promise<Puzzle | null>;
  listPuzzles(query?: PuzzleQuery): Promise<Puzzle[]>;
  nextPuzzle(game: PuzzleGame, opts?: NextPuzzleOptions): Promise<Puzzle | null>;
  countPuzzles(game: PuzzleGame): Promise<number>;
}

const DIFFICULTY_RANK: Record<PuzzleDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

/**
 * Easiest first, then by rating, then by id.
 *
 * Total and deterministic — the id tiebreak means two puzzles of equal
 * difficulty and rating can never swap places between calls, which is what lets
 * `after` page through the set without repeating or skipping.
 */
function byProgression(a: Puzzle, b: Puzzle): number {
  const rank = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
  if (rank !== 0) return rank;
  if (a.rating !== b.rating) return a.rating - b.rating;
  return a.id.localeCompare(b.id);
}

/**
 * A source over an in-memory table.
 *
 * The injectable `data` is what the runtime tests build fixtures from, so they
 * stay green while the shipped content churns.
 */
export function createStaticPuzzleSource(
  data: Record<PuzzleGame, Puzzle[]> = PUZZLES,
): PuzzleSource {
  const all = (): Puzzle[] => [...data.chess, ...data.checkers, ...data.reversi];

  return {
    async getPuzzle(id) {
      return all().find((p) => p.id === id) ?? null;
    },

    async listPuzzles(query = {}) {
      return all()
        .filter((p) => (query.game ? p.game === query.game : true))
        .filter((p) => (query.difficulty ? p.difficulty === query.difficulty : true))
        .filter((p) => (query.theme ? p.themes.includes(query.theme) : true))
        .sort(byProgression);
    },

    async nextPuzzle(game, opts = {}) {
      const solved = new Set(opts.solvedIds ?? []);
      const ordered = (data[game] ?? [])
        .filter((p) => !solved.has(p.id))
        .filter((p) => (opts.difficulty ? p.difficulty === opts.difficulty : true))
        .sort(byProgression);

      if (opts.after === undefined) return ordered[0] ?? null;

      // `after` may itself have been filtered out (just solved, most likely), so
      // page by ordering rather than by index.
      const anchor = (data[game] ?? []).find((p) => p.id === opts.after);
      if (!anchor) return ordered[0] ?? null;
      return ordered.find((p) => byProgression(p, anchor) > 0) ?? null;
    },

    async countPuzzles(game) {
      return (data[game] ?? []).length;
    },
  };
}

/** The shipped content, as a source. */
export const staticPuzzleSource: PuzzleSource = createStaticPuzzleSource();
