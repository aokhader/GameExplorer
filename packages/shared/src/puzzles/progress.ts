/**
 * Puzzle progress — the shape, and pure reducers over it. No I/O.
 *
 * The store that actually persists this is injected per platform (localStorage
 * on web, AsyncStorage on mobile), which keeps `packages/client`'s import
 * boundary intact and means a future server-backed store is a swap rather than
 * a rewrite.
 *
 * There is no auth read anywhere in this file, so **guests work by
 * construction** — which matters, because a puzzle is the shortest path from
 * "landed on the site" to "played something".
 */

import type { PuzzleGame } from './types';

export interface PuzzleProgress {
  /** Schema version. A record that doesn't say `1` is discarded, not migrated. */
  v: 1;
  /** Ids solved, in no particular order. */
  solved: string[];
  /** Consecutive clean solves — first try, no hint. */
  streak: number;
  bestStreak: number;
  /** Last puzzle seen per game, so "resume" lands where the player left off. */
  lastSeen: Partial<Record<PuzzleGame, string>>;
  /**
   * The band each game's picker last sat on, so a returning player finds the
   * difficulty they chose rather than the default.
   *
   * Optional, and `v` deliberately **stays 1**. An added optional field is
   * compatible in both directions — an old client ignores it, a new client
   * defaults it — whereas bumping the version would send every existing record
   * through `EMPTY_PROGRESS` and discard every player's solved set and streak
   * to introduce a UI preference.
   */
  bands?: Partial<Record<PuzzleGame, string>>;
  updatedAt: string;
}

export interface PuzzleProgressStore {
  load(): Promise<PuzzleProgress>;
  save(next: PuzzleProgress): Promise<void>;
}

export const EMPTY_PROGRESS: PuzzleProgress = {
  v: 1,
  solved: [],
  streak: 0,
  bestStreak: 0,
  lastSeen: {},
  bands: {},
  updatedAt: '',
};

/**
 * Storage keys, matching the conventions already in place: web prefixes `ge:`
 * (alongside `ge:onboarded`), mobile prefixes `gx:` (alongside `gx:onboarded`,
 * `gx:lastGame`).
 */
export const WEB_PUZZLE_PROGRESS_KEY = 'ge:puzzles';
export const MOBILE_PUZZLE_PROGRESS_KEY = 'gx:puzzles';

export function isSolved(progress: PuzzleProgress, id: string): boolean {
  return progress.solved.includes(id);
}

/**
 * How many of this game's puzzles have been solved, across every band.
 *
 * **Not what a band-scoped progress line wants.** Pairing this with a band's
 * size produces "3 / 1" for a player who solved two puzzles in one band and one
 * in another — the count and the total were measuring different sets. Use
 * {@link solvedAmong} with the band's ids for anything the player reads as
 * progress through a set; this one is for a whole-game total.
 */
export function solvedCount(progress: PuzzleProgress, game: PuzzleGame): number {
  return progress.solved.filter((id) => id.startsWith(`${game}-`)).length;
}

/**
 * How many of `ids` have been solved.
 *
 * Takes the ids rather than a band because progress stores ids and nothing
 * else: it has no ratings, so it cannot work out which band a solve belongs to
 * on its own. The caller — which already fetched the band — supplies them.
 */
export function solvedAmong(progress: PuzzleProgress, ids: readonly string[]): number {
  const solved = new Set(progress.solved);
  return ids.reduce((n, id) => (solved.has(id) ? n + 1 : n), 0);
}

/**
 * Record a solve.
 *
 * Only a `clean` solve extends the streak; a solve that took a retry or a hint
 * still counts as solved but resets the run. Re-solving an already-solved
 * puzzle doesn't duplicate the id, and doesn't extend the streak either — the
 * streak is meant to measure new ground.
 */
export function recordSolved(
  progress: PuzzleProgress,
  id: string,
  clean: boolean,
): PuzzleProgress {
  const alreadySolved = isSolved(progress, id);
  const streak = clean && !alreadySolved ? progress.streak + 1 : 0;

  return {
    ...progress,
    solved: alreadySolved ? progress.solved : [...progress.solved, id],
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    updatedAt: new Date().toISOString(),
  };
}

/** The player gave up or got it wrong — the streak ends, nothing else changes. */
export function recordFailed(progress: PuzzleProgress): PuzzleProgress {
  if (progress.streak === 0) return progress;
  return { ...progress, streak: 0, updatedAt: new Date().toISOString() };
}

export function recordSeen(
  progress: PuzzleProgress,
  game: PuzzleGame,
  id: string,
): PuzzleProgress {
  if (progress.lastSeen[game] === id) return progress;
  return {
    ...progress,
    lastSeen: { ...progress.lastSeen, [game]: id },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remember the band a player chose for a game.
 *
 * Returns the record unchanged when nothing moved, matching `recordSeen` — a
 * new `updatedAt` on every render would make the store write on every paint.
 */
export function recordBand(
  progress: PuzzleProgress,
  game: PuzzleGame,
  band: string,
): PuzzleProgress {
  if (progress.bands?.[game] === band) return progress;
  return {
    ...progress,
    bands: { ...progress.bands, [game]: band },
    updatedAt: new Date().toISOString(),
  };
}

/** Forget a game's solves, for "start over" once a set is exhausted. */
export function clearGame(progress: PuzzleProgress, game: PuzzleGame): PuzzleProgress {
  const lastSeen = { ...progress.lastSeen };
  delete lastSeen[game];
  return {
    ...progress,
    solved: progress.solved.filter((id) => !id.startsWith(`${game}-`)),
    lastSeen,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Forget a specific set of solves — "start over" scoped to one band.
 *
 * Bands made `clearGame` the wrong verb for that button. A player who has
 * worked through Club and then finishes Beginner would, on pressing Start over,
 * lose Club as well: the whole game's solves go, to restart a set of two. This
 * clears exactly the ids handed to it.
 *
 * `lastSeen` is left alone deliberately — it points at the last puzzle *seen*
 * per game, and clearing one band does not change which that was.
 */
export function clearPuzzles(
  progress: PuzzleProgress,
  ids: readonly string[],
): PuzzleProgress {
  const drop = new Set(ids);
  const solved = progress.solved.filter((id) => !drop.has(id));
  if (solved.length === progress.solved.length) return progress;
  return { ...progress, solved, updatedAt: new Date().toISOString() };
}

/**
 * Read a stored record.
 *
 * Anything unparseable, wrong-shaped, or from a future schema comes back as
 * `EMPTY_PROGRESS` rather than throwing: losing a streak is a far better
 * outcome than a crash on a screen a guest just opened, and there is nothing
 * here worth a migration path.
 */
export function parseProgress(raw: string | null | undefined): PuzzleProgress {
  if (!raw) return EMPTY_PROGRESS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;

    const record = parsed as Partial<PuzzleProgress>;
    if (record.v !== 1 || !Array.isArray(record.solved)) return EMPTY_PROGRESS;

    return {
      v: 1,
      solved: record.solved.filter((id): id is string => typeof id === 'string'),
      streak: typeof record.streak === 'number' ? record.streak : 0,
      bestStreak: typeof record.bestStreak === 'number' ? record.bestStreak : 0,
      lastSeen:
        typeof record.lastSeen === 'object' && record.lastSeen !== null ? record.lastSeen : {},
      bands: typeof record.bands === 'object' && record.bands !== null ? record.bands : {},
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function serializeProgress(progress: PuzzleProgress): string {
  return JSON.stringify(progress);
}
