/**
 * The game catalog.
 *
 * Until now there was no central manifest — each surface (home page, nav,
 * per-game hub) carried its own inline array, and the game key was re-declared
 * as a string-literal union in several packages. This file is the start of a
 * single source of truth.
 *
 * **Scope note:** only Liquidate reads from this today. Chess, checkers, and
 * reversi still use their existing inline definitions; migrating them touches
 * every listing surface, and folding that into the Liquidate work would have
 * made the change impossible to review. The entries below are accurate for all
 * four so the migration has something to move *to*.
 */

export type GameId = 'chess' | 'checkers' | 'reversi' | 'liquidate';

/** Play modes a game can offer. Not every game supports every mode. */
export type GameModeId = 'bot' | 'training' | 'online' | 'local' | 'learn';

export interface GameCatalogEntry {
  id: GameId;
  name: string;
  /** URL segment — the game lives at `/{slug}`. */
  slug: string;
  /** One-line description for cards and listings. */
  blurb: string;
  /** Accent key in `GAME_ACCENTS` and the `--c-game-*` CSS vars. */
  accent: GameId;
  minPlayers: number;
  maxPlayers: number;
  modes: GameModeId[];
  /** False while a game is still behind a "coming soon" card. */
  available: boolean;
  /**
   * Whether results are written to `games` / `user_ratings`. Liquidate is
   * casual-only: those tables model a two-player result (`player_color`,
   * `result: white|black|draw`) and cannot represent a six-player free-for-all.
   */
  rated: boolean;
}

export const GAME_CATALOG: Record<GameId, GameCatalogEntry> = {
  chess: {
    id: 'chess',
    name: 'Chess',
    slug: 'chess',
    blurb: 'The classic strategy game. Checkmate your opponent!',
    accent: 'chess',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'learn'],
    available: true,
    rated: true,
  },
  checkers: {
    id: 'checkers',
    name: 'Checkers',
    slug: 'checkers',
    blurb: 'Jump your way to victory in this classic board game.',
    accent: 'checkers',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'learn'],
    available: true,
    rated: true,
  },
  reversi: {
    id: 'reversi',
    name: 'Reversi',
    slug: 'reversi',
    blurb: 'Flip the board to your color. Strategic and fast-paced!',
    accent: 'reversi',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'learn'],
    available: true,
    rated: true,
  },
  liquidate: {
    id: 'liquidate',
    name: 'Liquidate',
    slug: 'liquidate',
    blurb: 'Claim planets, charge rent, and bankrupt your rivals. 2–6 players.',
    accent: 'liquidate',
    minPlayers: 2,
    maxPlayers: 6,
    modes: ['bot', 'local', 'learn'],
    available: true,
    rated: false,
  },
};

/** Catalog entries in display order. */
export const GAME_LIST: readonly GameCatalogEntry[] = [
  GAME_CATALOG.chess,
  GAME_CATALOG.checkers,
  GAME_CATALOG.reversi,
  GAME_CATALOG.liquidate,
];

/** True when a game seats more than two players. */
export function isMultiSeat(id: GameId): boolean {
  return GAME_CATALOG[id].maxPlayers > 2;
}
