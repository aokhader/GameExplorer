/**
 * Go — 9×9, positional superko, suicide illegal, two passes then a dead-stone
 * review, then the board is scored by the ruleset the game was started with.
 *
 * Everything here is JSON-serializable, like every other game state in the
 * package: the timeline lives in React state on both platforms and a finished
 * game's move list is written to Postgres as JSONB.
 */

export type GoColor = 'black' | 'white';

/**
 * `board[row][col]`, row 0 = rank 1 = the BOTTOM of the screen, matching the
 * `letter + rank` position convention every other board in the app uses
 * (`a1` is the bottom-left point). Null is an empty intersection — in Go a
 * stone sits on the intersection, not in the cell, but the array is indexed
 * exactly the same way.
 */
export type GoBoard = (GoColor | null)[][];

/** The only size v1 ships. The engine itself is size-generic throughout. */
export const GO_BOARD_SIZE = 9;

/**
 * Komi — the compensation White receives for moving second, added to White's
 * score. The default is fractional on purpose: it makes a tie arithmetically
 * impossible, so a game started at 7.5 never ends in a draw. Other presets are
 * offered on the setup screen and an integer one CAN tie, which is real Go
 * (jigo) and is handled rather than assumed away.
 */
export const DEFAULT_KOMI = 7.5;

/**
 * How the final board is counted.
 *
 * - `area` — Tromp-Taylor: your stones on the board plus the empty points only
 *   you surround. Captures do not score directly; the empty point left behind
 *   does.
 * - `territory` — Japanese: only the empty points you surround, plus every
 *   enemy stone you hold prisoner (taken in play, or removed in the review).
 *
 * They almost always agree on the winner. They disagree on *how* you play the
 * last few moves, which is why it is a choice rather than an implementation
 * detail: under area scoring a neutral point is free to fill, under territory
 * scoring filling your own eye-space costs you a point.
 */
export type GoScoring = 'area' | 'territory';

/**
 * Where the game is.
 *
 * `marking` is the interstitial the second pass opens: the game is NOT over,
 * neither side is to move, and the players are agreeing which stones are dead
 * before the board is counted. Keeping `isGameOver` false through it is what
 * stops the shared local-game loop saving a result that has not been agreed.
 */
export type GoPhase = 'playing' | 'marking' | 'scored';

/**
 * A single move. `position` is the intersection the stone was placed on; null
 * means the player passed — the same convention `ReversiMove` uses for a
 * skipped turn. `captures` lists every enemy stone this move removed.
 */
export interface GoMove {
  position: string | null;
  color: GoColor;
  captures: string[];
}

/** A final or running score, under whichever ruleset produced it. */
export interface GoScore {
  /** Black's total. */
  black: number;
  /** White's total, komi included. */
  white: number;
  komi: number;
  /** Black − White. Positive = Black ahead. */
  lead: number;
  /** Which ruleset these numbers were counted under. */
  scoring: GoScoring;
}

export interface GoGameState {
  size: number;
  komi: number;
  /** Chosen at setup and fixed for the game. */
  scoring: GoScoring;
  board: GoBoard;
  currentTurn: GoColor;
  moveHistory: GoMove[];
  /**
   * How many enemy stones each colour has captured, cumulative — `captured.black`
   * is the number of WHITE stones Black has taken off. Under area scoring these
   * do not score directly (the empty point left behind does); under territory
   * scoring they are prisoners and count a point each. Either way every Go UI
   * shows them, so the engine keeps the count rather than making each client
   * re-derive it from the move history.
   */
  captured: { black: number; white: number };
  /**
   * Every board position that has occurred, as a board key (see `boardKey`).
   * This is what enforces **positional superko**: a move may not recreate any
   * earlier position, which subsumes the simple ko rule and closes the longer
   * cycles (triple ko, sending-two-returning-one) that a single ko point misses.
   *
   * Appended immutably. The strings are shared by reference across timeline
   * entries, so a whole game's history costs pointers, not kilobytes.
   */
  positionKeys: string[];
  /** Two in a row open the dead-stone review. */
  consecutivePasses: number;
  /** `playing` → `marking` (two passes) → `scored`. See `GoPhase`. */
  phase: GoPhase;
  /**
   * Points agreed dead in the review, sorted so a state has one canonical form.
   * Empty until the board is finalized; the stones are removed from `board`
   * when it is, so this is a record of what was agreed rather than live input.
   */
  deadStones: string[];
  /** True only once the board has been counted — never during `marking`. */
  isGameOver: boolean;
  /** Null while the game is in progress, or on an exact tie at integer komi. */
  winner: GoColor | null;
}

export interface GoMoveResult {
  valid: boolean;
  reason?: string;
  resultingState?: GoGameState;
}
