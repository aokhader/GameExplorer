/**
 * Puzzle model — the shape a puzzle has, and the contract a game engine must
 * satisfy to be playable as one.
 *
 * Lives in `puzzles/` rather than `constants/puzzles/` on purpose: this module
 * holds types and (in its siblings) functions, while `constants/puzzles/` keeps
 * the tutorials' data-only contract so a database row can drop in there
 * unchanged.
 */

import type { PieceType } from '../types/chess.types';

export type PuzzleGame = 'chess' | 'checkers' | 'reversi';
export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

/**
 * What the solver is being asked to achieve. The validation suite checks the
 * claim against the real engine at the end of the line, so a wrong goal fails
 * the build rather than misleading a player.
 */
export type PuzzleGoal = 'mate' | 'win-material' | 'promote' | 'win-game' | 'best-move';

/** One ply-pair: the move the player must find, and the opponent's scripted answer. */
export interface PuzzleStep {
  /**
   * Coordinate move in this game's notation — chess `"e7e8q"`, checkers
   * `"c3e5"` or a full jump path `"c3e5g7"`, reversi `"d3"`.
   */
  move: string;
  /** Equally-good alternatives at this ply. Declared for v2; unused in v1. */
  also?: string[];
  /** The opponent's reply. Absent on the final step — that IS "solved". */
  reply?: string;
  /** Optional per-step aside, shown once the step is played. */
  note?: string;
}

export interface Puzzle {
  /** `"chess-001"`. Becomes the primary key when these move to a table. */
  id: string;
  game: PuzzleGame;
  /** Start position in this game's serialization — FEN / PDN FEN / board string. */
  position: string;
  /** Whose side the solver plays. Must equal the position's side to move. */
  playerColor: 'white' | 'black';
  goal: PuzzleGoal;
  /** Pawns of material swing required, for `goal: 'win-material'`. */
  goalValue?: number;
  /** "White to play and mate in two." */
  prompt: string;
  difficulty: PuzzleDifficulty;
  /** Rough solver rating. Orders `nextPuzzle` within a difficulty band. */
  rating: number;
  /** Tags drawn from PUZZLE_THEMES. */
  themes: string[];
  steps: PuzzleStep[];
  explanation: string;
  /** "Composed by Loyd, 1878" / "mined from game 4821". */
  source?: string;
}

export const PUZZLE_THEMES = [
  // chess
  'fork',
  'pin',
  'skewer',
  'back-rank',
  'discovered-attack',
  'deflection',
  'sacrifice',
  'promotion',
  'mate-in-1',
  'mate-in-2',
  'endgame',
  // checkers
  'double-jump',
  'shot',
  'trapped-piece',
  // reversi
  'corner',
  'x-square',
  'wedge',
  'forced-pass',
  'parity',
] as const;

export type PuzzleTheme = (typeof PUZZLE_THEMES)[number];

/**
 * A move as the runtime handles it, decoded from a step string or handed up by
 * a board.
 *
 * Reversi has no origin square, so `from === to` there — that matches the
 * `LocalMove` convention the boards already use. `path` carries a checkers
 * multi-jump's intermediate landing squares when the author spelled the chain
 * out; it exists so an ambiguous chain can be disambiguated without a schema
 * change, and is not consulted for matching.
 */
export interface PuzzleMove {
  from: string;
  to: string;
  /** Chess promotion piece. Absent on every other move. */
  promotion?: PieceType;
  /** Checkers multi-jump landing squares, final element === `to`. */
  path?: string[];
}

/**
 * Everything the puzzle runtime needs from a game engine.
 *
 * Implemented once per game in `rules.ts`; the runtime never imports an engine
 * directly, which is what keeps `runtime.ts` a pure reducer over an opaque `S`.
 */
export interface PuzzleRules<S> {
  game: PuzzleGame;
  /** Throws on a malformed position — authoring bugs must not decode silently. */
  decode(position: string): S;
  encode(state: S): string;
  currentTurn(state: S): 'white' | 'black';
  /** Throws on a malformed move string, for the same reason as `decode`. */
  parseMove(move: string): PuzzleMove;
  formatMove(move: PuzzleMove): string;
  /** Does the player's board input answer the scripted move? */
  sameMove(input: PuzzleMove, scripted: PuzzleMove): boolean;
  validateMove(state: S, move: PuzzleMove): { valid: boolean; resultingState?: S };
  isGameOver(state: S): boolean;
  /** Reversi only — the side to move has no legal move and must pass. */
  mustPass?(state: S): boolean;
  executePass?(state: S): S;
  /**
   * Best move for the side to move, with the position's score.
   *
   * The **only** engine call in the whole feature, and it is never consulted
   * about whether the player is right — correctness stays scripted and proved
   * at authoring time. This exists to answer the other question: when the
   * player plays something that isn't the solution, what does the opponent do
   * about it?
   *
   * `score` is WHITE-positive in every game, so the runtime can measure what a
   * move cost without knowing which game it is.
   *
   * Depth is the caller's choice because the three engines are not remotely
   * comparable in cost — see `REFUTATION_DEPTH`.
   */
  analyze(state: S, depth: number): { score: number; bestMove: PuzzleMove | null };
}
