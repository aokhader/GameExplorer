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

/** How many of this game's puzzles have been solved. Ids are game-prefixed. */
export function solvedCount(progress: PuzzleProgress, game: PuzzleGame): number {
  return progress.solved.filter((id) => id.startsWith(`${game}-`)).length;
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
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function serializeProgress(progress: PuzzleProgress): string {
  return JSON.stringify(progress);
}
