/**
 * The three games bound to the puzzle contract.
 *
 * Pure engine wiring — both apps import these, so neither platform carries a
 * rules file of its own. Nothing here reaches for an analyzer or a bot: a
 * puzzle's solution line is scripted and proved forced by the validation suite
 * at authoring time, so the solve loop is plain TypeScript on both platforms.
 */

import { ChessEngine } from '../game-logic/chess/engine';
import { fenToState, stateToFen } from '../game-logic/chess/fen';
import { parseUciMoveString, uciMoveString } from '../game-logic/chess/uci';
import { CheckersEngine } from '../game-logic/checkers/engine';
import { checkersFenToState, stateToCheckersFen } from '../game-logic/checkers/fen';
import { ReversiEngine } from '../game-logic/reversi/engine';
import { boardStringToState, stateToBoardString } from '../game-logic/reversi/boardString';
import type { ChessGameState } from '../types/chess.types';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';
import type { PuzzleGame, PuzzleRules } from './types';

// ---------------------------------------------------------------------------
// Chess
// ---------------------------------------------------------------------------

export const chessPuzzleRules: PuzzleRules<ChessGameState> = {
  game: 'chess',
  // Correct on the four terminal-status flags as of the Phase 0a engine fix —
  // a puzzle that starts in check decodes as being in check, with no
  // compensation here.
  decode: (position) => fenToState(position),
  encode: (state) => stateToFen(state),
  currentTurn: (state) => state.currentTurn,

  parseMove(move) {
    const parsed = parseUciMoveString(move);
    if (!parsed) throw new Error(`Invalid chess puzzle move: '${move}'`);
    return { from: parsed.from, to: parsed.to, promotion: parsed.promotion };
  },

  formatMove: (move) => uciMoveString(move),

  sameMove(input, scripted) {
    if (input.from !== scripted.from || input.to !== scripted.to) return false;
    // A board that auto-queens hands up `promotion: 'queen'`, and a scripted
    // "e7e8q" parses to exactly that — so the two match without a special case.
    // An underpromotion has to be answered with the same piece.
    return input.promotion === scripted.promotion;
  },

  validateMove(state, move) {
    const result = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion);
    // `needsPromotion` comes back valid-but-stateless when a promoting move
    // arrived without a piece. Treat it as not-yet-a-move: the board asks the
    // player which piece, then sends it again.
    if (!result.resultingState) return { valid: false };
    return { valid: result.valid, resultingState: result.resultingState };
  },

  isGameOver: (state) => state.isCheckmate || state.isStalemate || state.isDraw,
};

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

/** Squares are two characters each, so a chain splits on a fixed stride. */
function splitCheckersSquares(move: string): string[] {
  const squares: string[] = [];
  for (let i = 0; i < move.length; i += 2) squares.push(move.slice(i, i + 2));
  return squares;
}

export const checkersPuzzleRules: PuzzleRules<CheckersGameState> = {
  game: 'checkers',
  decode: (position) => checkersFenToState(position),
  encode: (state) => stateToCheckersFen(state),
  currentTurn: (state) => state.currentTurn,

  parseMove(move) {
    const squares = splitCheckersSquares(move.trim());
    if (squares.length < 2 || squares.some((s) => !/^[a-h][1-8]$/.test(s))) {
      throw new Error(`Invalid checkers puzzle move: '${move}'`);
    }
    const from = squares[0];
    const to = squares[squares.length - 1];
    // Only a spelled-out chain carries a path; a plain "c3e5" has none.
    return squares.length > 2 ? { from, to, path: squares.slice(1) } : { from, to };
  },

  formatMove: (move) => (move.path ? [move.from, ...move.path].join('') : move.from + move.to),

  // `path` is deliberately not compared: a board reports only where the piece
  // started and where it was dropped, and the engine resolves the chain.
  sameMove: (input, scripted) => input.from === scripted.from && input.to === scripted.to,

  validateMove(state, move) {
    const result = CheckersEngine.validateMove(state, move.from, move.to);
    return { valid: result.valid, resultingState: result.resultingState };
  },

  isGameOver: (state) => state.isGameOver,
};

// ---------------------------------------------------------------------------
// Reversi
// ---------------------------------------------------------------------------

export const reversiPuzzleRules: PuzzleRules<ReversiGameState> = {
  game: 'reversi',
  decode: (position) => boardStringToState(position),
  encode: (state) => stateToBoardString(state),
  currentTurn: (state) => state.currentTurn,

  parseMove(move) {
    const square = move.trim();
    if (!/^[a-h][1-8]$/.test(square)) {
      throw new Error(`Invalid reversi puzzle move: '${move}'`);
    }
    // A placement has no origin; `from === to` is the convention the boards use.
    return { from: square, to: square };
  },

  formatMove: (move) => move.to,

  sameMove: (input, scripted) => input.to === scripted.to,

  validateMove(state, move) {
    const result = ReversiEngine.validateMove(state, move.to);
    return { valid: result.valid, resultingState: result.resultingState };
  },

  isGameOver: (state) => state.isGameOver,
  mustPass: (state) => ReversiEngine.mustPass(state),
  executePass: (state) => ReversiEngine.executePass(state),
};

// ---------------------------------------------------------------------------

/** Rules by game, each keeping its own concrete state type. */
export const PUZZLE_RULES = {
  chess: chessPuzzleRules,
  checkers: checkersPuzzleRules,
  reversi: reversiPuzzleRules,
};

/**
 * The rules for a game whose state type the caller names.
 *
 * A dynamic route knows the game only as a string, and every state it holds
 * came out of these same rules and goes straight back into them — so the one
 * cast here is the honest place to lose the link, rather than smearing `never`
 * or `any` across the three bindings above.
 */
export function puzzleRulesFor<S>(game: PuzzleGame): PuzzleRules<S> {
  return PUZZLE_RULES[game] as unknown as PuzzleRules<S>;
}
