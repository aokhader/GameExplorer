/**
 * The game catalog — one source of truth for what games exist, what modes each
 * offers, and how each is described.
 *
 * There used to be no central manifest: every surface (home page, nav, welcome
 * tour, per-game hub) carried its own inline array on each platform, so the same
 * game was declared four times per platform and a mode landing on web but not
 * mobile was invisible until someone went looking. Reading from here makes that
 * kind of drift a **data diff** rather than an archaeology exercise — which is
 * the entire reason web and mobile diverged in the first place.
 *
 * **Copy comes in three registers, and all three live here.** They are named for
 * the surface's voice, not the platform, because both platforms use all three:
 * `blurb` is a full sentence (web's home cards), `hook` is a punchy one-liner
 * (mobile's home cards), `tagline` is two or three words (both welcome tours).
 * Keeping the registers distinct is deliberate — collapsing them would either
 * bloat a phone card or gut a marketing one.
 *
 * **Icons deliberately stay per-platform.** Web draws Unicode glyphs; mobile
 * draws the Game Pieces vector art, because those same glyphs get emoji-font
 * substitution on Android and never matched the design. That is a genuine
 * platform difference, not drift.
 */

import { DIFFICULTY_ELO, type OnboardingGame } from './onboarding';

export type GameId = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

/** Play modes a game can offer. Not every game supports every mode. */
export type GameModeId = 'bot' | 'training' | 'online' | 'local' | 'learn' | 'puzzles';

export interface GameCatalogEntry {
  id: GameId;
  name: string;
  /** URL segment — the game lives at `/{slug}`. */
  slug: string;
  /** Full sentence, for a card with room to breathe (web's home). */
  blurb: string;
  /** Punchy one-liner, for a card that has to fit a phone (mobile's home). */
  hook: string;
  /** Two or three words, for a tight row (both welcome tours). */
  tagline: string;
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
    hook: 'Outplay the bot at every level.',
    tagline: 'Timeless strategy',
    accent: 'chess',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'local', 'learn', 'puzzles'],
    available: true,
    rated: true,
  },
  checkers: {
    id: 'checkers',
    name: 'Checkers',
    slug: 'checkers',
    blurb: 'Jump your way to victory in this classic board game.',
    hook: 'Fast, punchy, endlessly re-matchable.',
    tagline: 'Easy to learn',
    accent: 'checkers',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'local', 'learn', 'puzzles'],
    available: true,
    rated: true,
  },
  reversi: {
    id: 'reversi',
    name: 'Reversi',
    slug: 'reversi',
    blurb: 'Flip the board to your color. Strategic and fast-paced!',
    hook: 'Swing the whole board in one move.',
    tagline: 'Quick to master',
    accent: 'reversi',
    minPlayers: 2,
    maxPlayers: 2,
    modes: ['bot', 'training', 'online', 'local', 'learn', 'puzzles'],
    available: true,
    rated: true,
  },
  go: {
    id: 'go',
    name: 'Go',
    slug: 'go',
    blurb: 'Surround territory on a 9×9 board. The simplest rules in this catalog, and the deepest game.',
    hook: 'Claim more of the board than they do.',
    tagline: 'Ancient and deep',
    accent: 'go',
    minPlayers: 2,
    maxPlayers: 2,
    // No `online` (the socket protocol seats two known game types and Go is not
    // one of them yet) and no `puzzles`: the puzzle gate proves a solution line
    // forced by replaying it through the engine, and no Go engine here can settle
    // that the way the chess and checkers analyzers do.
    modes: ['bot', 'training', 'local', 'learn'],
    available: true,
    rated: true,
  },
  liquidate: {
    id: 'liquidate',
    name: 'Liquidate',
    slug: 'liquidate',
    blurb: 'Claim planets, charge rent, and bankrupt your rivals. 2–6 players.',
    hook: 'Corner the sector and squeeze them out.',
    tagline: 'Claim the sector',
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
  GAME_CATALOG.go,
  GAME_CATALOG.liquidate,
];

/** A catalog entry the first-run tour can actually offer. */
export interface TourGameEntry extends GameCatalogEntry {
  id: OnboardingGame;
}

/**
 * The games the first-run tour can offer, in order.
 *
 * Both halves of the predicate are load-bearing, and neither is "not Liquidate".
 * The tour ends by picking a bot difficulty on a game's own ELO ladder, so a
 * game qualifies only if its results move a rating (`rated`) **and** the ladder
 * has an entry for it (`DIFFICULTY_ELO`). Liquidate fails both: it is casual by
 * construction, because the `games`/`user_ratings` tables model a two-player
 * result and cannot represent a six-player free-for-all.
 *
 * Checking membership rather than asserting it also narrows the type honestly —
 * both tours index `DIFFICULTY_ELO` by this id. A rated game added without a
 * ladder entry drops out of the tour rather than crashing it, which is the safer
 * of the two failures; the tour is a first-run nicety, not a required path.
 */
export const TOUR_GAMES: readonly TourGameEntry[] = GAME_LIST.filter(
  (g): g is TourGameEntry => g.rated && g.id in DIFFICULTY_ELO,
);

/** True when a game seats more than two players. */
export function isMultiSeat(id: GameId): boolean {
  return GAME_CATALOG[id].maxPlayers > 2;
}
