/**
 * Coached lessons — the shape a lesson has, as pure data.
 *
 * A **sibling** of `TutorialSection`, not an extension of it, for three reasons
 * that are all load-bearing:
 *
 * 1. **Diagrams cannot become positions.** `ChessDiagramPiece[]` is a piece list
 *    with no side to move, no castling rights and no en-passant square;
 *    `GoDiagramPiece[]` has no ko point and no capture counts. Replaying a
 *    lesson needs a *serialization*, and converting a diagram into one means
 *    inventing the missing fields. `Puzzle.position` already solved this, so
 *    this module reuses that convention exactly — FEN for chess, the PDN-style
 *    FEN for checkers, the two board strings for reversi and Go.
 * 2. `TutorialArticle` and mobile's `TutorialScreen` are server-renderable and
 *    engine-free. A lesson is inherently a client surface with an engine
 *    binding, and putting one inside `sections[]` would force `'use client'` on
 *    the rules pages and drag four engines into the `/{game}/learn` RSC payload.
 * 3. `/{game}/learn` carries per-route SEO metadata and must keep
 *    server-rendering.
 *
 * What *is* reused: the `a1..h8` square convention, the `PuzzleGame` union, and
 * the mark vocabulary `DiagramHighlight` already established.
 *
 * Everything here is data. The functions that interpret it live in
 * `lessons/matching.ts` and `lessons/runtime.ts`, and the content itself lives
 * in `constants/lessons/` — the same split `puzzles/` and `constants/puzzles/`
 * keep, for the same reason: a lesson has to survive
 * `JSON.parse(JSON.stringify(x))` so it can come back out of a database row.
 */

import type { PuzzleGame } from '../puzzles/types';

/** Lessons cover the four games with a `PuzzleRules` binding. Liquidate has none. */
export type LessonGame = PuzzleGame;

/**
 * The shape a move must have to be accepted, **as data**.
 *
 * Evaluated by `matching.ts`, never by a function stored here. A predicate
 * would be the obvious way to write this and is exactly what cannot be done: it
 * could not survive `JSON.parse(JSON.stringify(x))`, could not come back out of
 * a database row, and could not cross the RSC boundary the rules pages need.
 *
 * Every field is a conjunct — all of the ones present must hold.
 */
export interface LessonMoveMatch {
  /**
   * Piece kind in this game's own vocabulary, as `PuzzleMoveFacts.piece`
   * reports it: chess names the six, checkers says `man` or `king`, Go places a
   * `stone` and reversi a `disc`.
   */
  piece?: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' | 'man' | 'stone' | 'disc';
  from?: string;
  to?: string;
  toAnyOf?: string[];
  fromAnyOf?: string[];
  /**
   * Pieces removed, or — in reversi, where nothing is ever removed — discs
   * flipped. `true` means "at least one", a number means exactly that many.
   */
  captures?: number | boolean;
  /** Chess and checkers only: the move must leave the opponent in check. */
  check?: boolean;
}

/**
 * What a step is waiting for.
 *
 * Four kinds, and the split between the last three is about who proved the
 * answer: `move` is an author's list, `any` is a shape the engine enumerates,
 * and `best` is the engine's own answer cached at authoring time so the runtime
 * never has to search on a phone.
 */
export type LessonExpectation =
  /** Nothing to play — the learner reads, and Continue advances. */
  | { kind: 'read' }
  /** One of these exact moves, compared with the game's own `sameMove`. */
  | { kind: 'move'; moves: string[] }
  /** Any legal move matching the shape — "make any knight move". */
  | { kind: 'any'; match: LessonMoveMatch }
  /**
   * The engine's own best move at `depth`.
   *
   * `moves` is a **cached answer**, and the content gate re-proves it against
   * `PuzzleRules.analyze` on every run — so retuning an engine fails the build
   * instead of quietly teaching a move that is no longer best. The runtime
   * itself only ever reads `moves`, and never searches.
   */
  | { kind: 'best'; moves: string[]; depth: number };

/**
 * A coached reaction to a specific wrong answer.
 *
 * Checked in order, so the specific entries come first and the catch-all — the
 * one with neither `when` nor `match` — comes last. This is what replaces the
 * puzzle mode's refutation search: a lesson answers a mistake with a sentence
 * an author wrote, which is both cheaper and more useful than a minimax line.
 */
export interface LessonMiss {
  /** Exact moves this line answers, in the game's move notation. */
  when?: string[];
  /** Or a shape, for "you moved into a capture" style coaching. */
  match?: LessonMoveMatch;
  say: string;
}

/** A drawn annotation on one square or intersection. */
export interface LessonMark {
  square: string;
  /**
   * `target` / `origin` tint the square, `move` draws the legal-destination
   * dot, `capture` the capture ring — the four `DiagramHighlight` already has.
   * `danger` is the one addition: a square the learner must NOT play on.
   */
  kind: 'target' | 'origin' | 'move' | 'capture' | 'danger';
  /**
   * One or two characters written on the square, as Go's static diagrams
   * already do for liberty counts and move numbers.
   */
  text?: string;
}

export interface LessonStep {
  id: string;
  /**
   * Reset the board to this position before the step.
   *
   * Absent → continue from wherever the previous step left off. This is the
   * field that lets one lesson walk eight unrelated micro-positions ("here is
   * how a rook moves; now a bishop") without being eight lessons, and it is the
   * one thing a `Puzzle` will never want — its runtime's whole invariant is
   * that the line never jumps.
   */
  position?: string;
  /** The task, in the imperative. Shown for as long as the step is open. */
  instruction: string;
  expect: LessonExpectation;
  /** The coach's reaction to getting it right. Required on every non-`read` step. */
  success?: string;
  /** Named wrong answers, checked in order; the catch-all goes last. */
  misses?: LessonMiss[];
  marks?: LessonMark[];
  /**
   * The opponent's scripted answer, played after the learner's accepted move.
   *
   * The gate proves it is legal after **every** accepted move, not just the
   * first — which matters most for an `any` step, where "every" is a set the
   * engine enumerates rather than a list somebody typed.
   */
  reply?: string;
  /**
   * A written nudge. Absent → the hint is the first accepted move, drawn on the
   * board. Both are offered when this is present: the sentence says what to
   * look for, the arrow says where.
   */
  hint?: string;
}

export interface Lesson {
  /** `chess-l01`. */
  id: string;
  game: LessonGame;
  title: string;
  /** One sentence, shown on the card and as the coach's opening line. */
  summary: string;
  /** Opening position, in the same encoding as `Puzzle.position`. */
  position: string;
  learnerColor: 'white' | 'black';
  steps: LessonStep[];
  /** The closing line, shown once the last step is done. */
  outro: string;
  /**
   * Section id in `TUTORIALS[game]` this lesson teaches.
   *
   * The gate proves it resolves, so renaming a heading in the rules article
   * breaks the build rather than shipping a dead cross-link.
   */
  teaches?: string;
  estimatedMinutes: number;
}

export interface GameLessonSet {
  game: LessonGame;
  lessons: Lesson[];
}
