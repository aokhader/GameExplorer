/**
 * Lazy facade over `@gameexplorer/db` for page components.
 *
 * Importing `@gameexplorer/db` statically puts the whole Supabase client
 * (~40 KB gz prod, >1 MB of modules in dev) into a route's initial JS even
 * though these calls only happen after mount (rating fetch) or at game end
 * (save). Each wrapper dynamically imports the package on first call, so
 * routes render before Supabase ever loads. Signatures are pinned to the real
 * ones via `typeof`, so this stays in sync with the package.
 *
 * Pages that need Supabase immediately (auth, profile) still import
 * `@gameexplorer/db` directly — deferring would gain nothing there.
 */
import type * as DB from '@gameexplorer/db';

const db = () => import('@gameexplorer/db');

export const saveGame: typeof DB.saveGame = async (...args) =>
  (await db()).saveGame(...args);

export const saveCheckersGame: typeof DB.saveCheckersGame = async (...args) =>
  (await db()).saveCheckersGame(...args);

export const saveReversiGame: typeof DB.saveReversiGame = async (...args) =>
  (await db()).saveReversiGame(...args);

export const getGames: typeof DB.getGames = async (...args) =>
  (await db()).getGames(...args);

export const getGameById: typeof DB.getGameById = async (...args) =>
  (await db()).getGameById(...args);

export const getUserRating: typeof DB.getUserRating = async (...args) =>
  (await db()).getUserRating(...args);

export const upsertUserRating: typeof DB.upsertUserRating = async (...args) =>
  (await db()).upsertUserRating(...args);

// Types are erased at compile time — re-exported for convenience so callers
// can keep a single import.
export type {
  SavedGame,
  GameListItem,
  UserRating,
  GameType,
  GameResult,
  SaveGameOptions,
} from '@gameexplorer/db';
