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

export type PuzzleGame = 'chess' | 'checkers' | 'reversi' | 'go';
export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

/**
 * What the solver is being asked to achieve. The validation suite checks the
 * claim against the real engine at the end of the line, so a wrong goal fails
 * the build rather than misleading a player.
 */
export type PuzzleGoal =
  | 'mate'
  | 'win-material'
  | 'promote'
  | 'win-game'
  | 'best-move'
  /** Go — capture the group named by `target`, or leave it unable to live. */
  | 'kill'
  /** Go — make the group named by `target` impossible to capture. */
  | 'live';

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
  /**
   * Go only — the boundary of the fight. Every point either side may play in;
   * anything outside it stands in for "the rest of the board is settled".
   *
   * Carried on the puzzle rather than derived because it is part of the problem
   * as composed, the same way a tsumego diagram's frame is. It is also what
   * makes a Go puzzle *provable*: "is this group dead" is only decidable inside
   * a stated boundary, and the validation suite searches this region
   * exhaustively to show the key move is the only one that works.
   */
  region?: string[];
  /**
   * Go only — any stone of the group whose life is at stake, for `goal: 'kill'`
   * and `goal: 'live'`.
   */
  target?: string;
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
  // chess — added for the imported set. Every one of these is a Lichess theme
  // with enough volume that dropping it would throw away puzzles rather than
  // merely leave them untagged; see `scripts/puzzles/import-lichess.mjs`.
  'mate-in-3',
  'hanging-piece',
  'double-check',
  'attraction',
  'clearance',
  'interference',
  'x-ray',
  'zugzwang',
  'quiet-move',
  'defensive-move',
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
  // go
  'ladder',
  'net',
  'snapback',
  'capture-race',
  'eye-shape',
  'vital-point',
  'false-eye',
  'throw-in',
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
 * What a legal move actually did, in terms every game can answer.
 *
 * Exists so a lesson can accept "any move that captures something" without the
 * matcher knowing which game it is. The vocabulary is each game's own — a
 * checkers piece is a `'man'` or a `'king'`, a Go move places a `'stone'`, a
 * reversi move places a `'disc'` — because the alternative is a lowest common
 * denominator that can only say "a piece moved", which is not a thing anybody
 * wants to teach.
 */
export interface PuzzleMoveFacts {
  /** Kind of piece that moved or was placed, in this game's vocabulary. */
  piece: string;
  /**
   * Pieces removed from the board.
   *
   * Reversi reports discs **flipped**, which is its analogue and the only
   * number a reversi lesson could mean — nothing is ever removed there.
   */
  captures: number;
  /** Chess and checkers only; false in the two placement games. */
  check: boolean;
  /** The move ends the game. */
  terminal: boolean;
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
  /**
   * Explain a position — used to punish a wrong move, never to judge one.
   *
   * `score` is **white-positive in every game**, so one flip in the runtime
   * puts it in the player's terms. `puzzle` is the puzzle being explained; the
   * three board games ignore it, and Go needs it because "is this group dead"
   * is only a question inside the boundary the puzzle states.
   */
  analyze(
    state: S,
    depth: number,
    puzzle?: Puzzle,
  ): { score: number; bestMove: PuzzleMove | null };
  /**
   * Every legal move for the side to move.
   *
   * Not needed by the puzzle runtime, which only ever compares against a
   * scripted string. Lessons need it to answer "make any knight move" without
   * enumerating the answers by hand, and it is the honest way to prove such a
   * step is teachable: a step that accepts *every* legal move is a Continue
   * button wearing a board.
   */
  legalMoves(state: S): PuzzleMove[];
  /**
   * What a legal move did. Throws on an illegal move, like `decode` and
   * `parseMove` — a caller asking about a move that cannot be played has a bug,
   * and returning a zeroed answer would hide it.
   */
  describeMove(state: S, move: PuzzleMove): PuzzleMoveFacts;
}
