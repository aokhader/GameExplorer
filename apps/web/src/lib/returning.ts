import { WEB_LESSON_PROGRESS_KEY, WEB_PUZZLE_PROGRESS_KEY, parseProgress } from '@gameexplorer/shared';

/**
 * Which Home a visitor gets (`project-docs/ux-fix-ideas.md` §4.1): a stranger
 * with no history sees the landing page at `/`, and anyone who has played sees
 * the launcher.
 *
 * **Why a cookie at all.** The server cannot read `localStorage`, and rendering
 * the landing page and swapping in the launcher after hydration would flash the
 * wrong page at every returning player. So the first sign of history sets
 * `gx_returning`, and a rewrite in `next.config.ts` serves `/home` for `/`
 * whenever the cookie is present — which keeps both pages static.
 *
 * The cookie is a single flag: no identifier, nothing about the games.
 */

export const RETURNING_COOKIE = 'gx_returning';

const YEAR_S = 365 * 24 * 60 * 60;

export function hasReturningCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${RETURNING_COOKIE}=`));
}

/** Idempotent, and cheap enough to call on every write that means "this player has played". */
export function markReturning(): void {
  if (typeof document === 'undefined' || hasReturningCookie()) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${RETURNING_COOKIE}=1; Path=/; Max-Age=${YEAR_S}; SameSite=Lax${secure}`;
}

/**
 * Whether this browser holds any history the launcher could use — a remembered
 * setup, a game in progress or played, a solved puzzle, lesson progress — for
 * players whose history predates the cookie.
 */
export function hasLocalHistory(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i) ?? '';
      if (
        key.startsWith('gx:setup:') ||
        key.startsWith('gx:inprogress:') ||
        key === 'gx:playedAt' ||
        key === 'gx:finishedGame' ||
        key.startsWith('ge:liquidate:') ||
        key === WEB_LESSON_PROGRESS_KEY
      ) {
        return true;
      }
      // Opening a puzzle records which one was seen; only a solve is history.
      if (key === WEB_PUZZLE_PROGRESS_KEY && parseProgress(storage.getItem(key)).solved.length > 0) {
        return true;
      }
    }
  } catch {
    /* blocked storage — a stranger, as far as anyone can tell */
  }
  return false;
}
