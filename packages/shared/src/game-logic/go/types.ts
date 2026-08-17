/**
 * Go — 9×9, area (Tromp-Taylor) scoring, positional superko, suicide illegal.
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
 * area score. Fractional on purpose: it makes a tie arithmetically impossible,
 * so `winner` is never null on a scored game and no draw path has to exist in
 * the UI. 7.5 is the standard 9×9 komi under area scoring.
 */
export const DEFAULT_KOMI = 7.5;

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

/** An area score: stones on the board plus the empty points they enclose. */
export interface GoScore {
  /** Black's stones + territory. */
  black: number;
  /** White's stones + territory + komi. */
  white: number;
  komi: number;
  /** Black − White. Positive = Black ahead. */
  lead: number;
}

export interface GoGameState {
  size: number;
  komi: number;
  board: GoBoard;
  currentTurn: GoColor;
  moveHistory: GoMove[];
  /**
   * How many enemy stones each colour has captured, cumulative — `captured.black`
   * is the number of WHITE stones Black has taken off. Under area scoring these
   * do not score directly (the empty point left behind does), but every Go UI
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
  /** Two in a row ends the game. */
  consecutivePasses: number;
  isGameOver: boolean;
  /** Null while the game is in progress; fractional komi rules out a tie. */
  winner: GoColor | null;
}

export interface GoMoveResult {
  valid: boolean;
  reason?: string;
  resultingState?: GoGameState;
}
