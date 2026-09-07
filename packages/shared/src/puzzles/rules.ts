/**
 * The three games bound to the puzzle contract.
 *
 * Pure engine wiring — both apps import these, so neither platform carries a
 * rules file of its own.
 *
 * A puzzle's solution line is scripted and proved forced by the validation
 * suite at authoring time, so **judging the player is plain TypeScript** on
 * both platforms with no engine involved. The one analyzer binding below is
 * used for the opposite job: explaining a wrong move by showing what the
 * opponent would do to it. See `PuzzleRules.analyze`.
 */

import { ChessEngine } from '../game-logic/chess/engine';
import { analyzeChessPosition } from '../game-logic/chess/weakEngine';
import { getPieceAt as getChessPieceAt } from '../game-logic/chess/utils';
import { fenToState, stateToFen } from '../game-logic/chess/fen';
import { parseUciMoveString, uciMoveString } from '../game-logic/chess/uci';
import { CheckersEngine } from '../game-logic/checkers/engine';
import { analyzeCheckersPosition } from '../game-logic/checkers/weakEngine';
import { getPieceAt as getCheckersPieceAt } from '../game-logic/checkers/utils';
import { checkersFenToState, stateToCheckersFen } from '../game-logic/checkers/fen';
import { GoEngine } from '../game-logic/go/engine';
import { goBoardStringToState, stateToGoBoardString } from '../game-logic/go/boardString';
import { TSUMEGO_PASS, tryTsumego } from '../game-logic/go/tsumego';
import { getOpponentColor, getStoneAt } from '../game-logic/go/utils';
import { ReversiEngine } from '../game-logic/reversi/engine';
import { analyzeReversiPosition } from '../game-logic/reversi/weakEngine';
import { boardStringToState, stateToBoardString } from '../game-logic/reversi/boardString';
import type { ChessGameState } from '../types/chess.types';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';
import type { GoColor, GoGameState } from '../game-logic/go/types';
import type { Puzzle, PuzzleGame, PuzzleRules } from './types';

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

  analyze(state, depth) {
    const { score, bestMove } = analyzeChessPosition(state, depth);
    return {
      score,
      bestMove: bestMove
        ? { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion }
        : null,
    };
  },

  legalMoves: (state) => ChessEngine.getAllLegalMoves(state).map((m) => ({ from: m.from, to: m.to })),

  describeMove(state, move) {
    const piece = getChessPieceAt(state.board, move.from);
    if (!piece) throw new Error(`No piece on ${move.from}`);
    // Auto-queen when the caller did not say, matching what a board hands up —
    // otherwise a promoting move comes back valid-but-stateless (see
    // `validateMove`) and this would throw on a perfectly legal move.
    const promotion = move.promotion ?? 'queen';
    const result = ChessEngine.validateMove(state, move.from, move.to, false, promotion);
    if (!result.valid || !result.resultingState) {
      throw new Error(`Illegal chess move: ${move.from}${move.to}`);
    }
    const after = result.resultingState;
    return {
      piece: piece.type,
      // Counted rather than read off the destination square, because en passant
      // removes a pawn that was never standing on `to`.
      captures: countChessPieces(state.board) - countChessPieces(after.board),
      check: after.isCheck,
      terminal: after.isCheckmate || after.isStalemate || after.isDraw,
    };
  },
};

/** Pieces standing, both colours. Only ever compared with itself. */
function countChessPieces(board: ChessGameState['board']): number {
  let n = 0;
  for (const row of board) for (const square of row) if (square) n++;
  return n;
}

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

  analyze(state, depth) {
    const { score, bestMove } = analyzeCheckersPosition(state, depth);
    return { score, bestMove: bestMove ? { from: bestMove.from, to: bestMove.to } : null };
  },

  legalMoves: (state) =>
    CheckersEngine.getAllLegalMoves(state).map((m) => ({
      from: m.from,
      to: m.to,
      path: m.path.length > 1 ? m.path : undefined,
    })),

  describeMove(state, move) {
    // Read the engine's own move object rather than diffing boards: it already
    // carries the capture list and the crowning flag, and `find` here resolves
    // the chain the same way `validateMove` does.
    const engineMove = CheckersEngine.getAllLegalMoves(state).find(
      (m) => m.from === move.from && m.to === move.to,
    );
    if (!engineMove) throw new Error(`Illegal checkers move: ${move.from}${move.to}`);
    const piece = getCheckersPieceAt(state.board, move.from);
    if (!piece) throw new Error(`No piece on ${move.from}`);
    const after = CheckersEngine.validateMove(state, move.from, move.to).resultingState;
    return {
      // The piece as it stood BEFORE the move — a man that crowns on this move
      // was still a man when the player chose it, which is what a lesson asking
      // "move a man" means.
      piece: piece.type,
      captures: engineMove.captures.length,
      // Checkers has no check. The engine models a win as "no legal reply",
      // which `terminal` already carries.
      check: false,
      terminal: after?.isGameOver ?? false,
    };
  },
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

  analyze(state, depth) {
    const { score, bestMove } = analyzeReversiPosition(state, depth);
    // A placement has no origin, so `from === to` here as everywhere else.
    return {
      score,
      bestMove: bestMove ? { from: bestMove.position, to: bestMove.position } : null,
    };
  },

  legalMoves: (state) => ReversiEngine.getAllLegalMoves(state).map((p) => ({ from: p, to: p })),

  describeMove(state, move) {
    const result = ReversiEngine.validateMove(state, move.to);
    if (!result.valid || !result.resultingState) {
      throw new Error(`Illegal reversi move: ${move.to}`);
    }
    const after = result.resultingState;
    const played = after.moveHistory[after.moveHistory.length - 1];
    return {
      piece: 'disc',
      // Discs FLIPPED, not removed — see `PuzzleMoveFacts.captures`. Nothing is
      // ever taken off a reversi board, so this is the only number the field
      // could mean here, and it is the one a lesson about flanking asks for.
      captures: played?.flipped.length ?? 0,
      check: false,
      terminal: after.isGameOver,
    };
  },
};

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

/**
 * How decisive a settled life-and-death answer is, on the white-positive scale
 * every game's `analyze` reports in.
 *
 * A magnitude, not a measurement: a group lives or it does not, and there is no
 * partial credit to express. It only has to clear the runtime's refutation
 * threshold, which is what turns "your move fails" into the punishing line
 * being played out on the board.
 */
const GO_DECISIVE = 100;

/**
 * Go puzzles are life-and-death problems, and the reason is worth stating.
 *
 * Every other game here can be asked "what is the best move" by a search that
 * returns a number. Go cannot: its playing engine is Monte-Carlo, asynchronous,
 * and statistical, so a whole-board "best move" puzzle could not be *proved*
 * and would sometimes be wrong. Inside a stated boundary, though, life and
 * death is a small finite game that exhaustive search settles exactly — which is
 * what `region` and `target` on the puzzle are for, and why `analyze` needs the
 * puzzle rather than just the position.
 *
 * Deliberately no `mustPass`/`executePass`. The runtime's auto-pass exists for
 * reversi, where a player with no legal move must hand the turn back. Go's pass
 * is voluntary, and passing on the solver's behalf would spend a tempo the
 * problem is counting.
 */
export const goPuzzleRules: PuzzleRules<GoGameState> = {
  game: 'go',
  decode: (position) => goBoardStringToState(position),
  encode: (state) => stateToGoBoardString(state),
  currentTurn: (state) => state.currentTurn,

  parseMove(move) {
    const point = move.trim();
    if (!/^[a-z]\d{1,2}$/.test(point)) {
      throw new Error(`Invalid go puzzle move: '${move}'`);
    }
    // A placement has no origin; `from === to` is the convention the boards use.
    return { from: point, to: point };
  },

  formatMove: (move) => move.to,

  sameMove: (input, scripted) => input.to === scripted.to,

  validateMove(state, move) {
    const result = GoEngine.validateMove(state, move.to);
    return { valid: result.valid, resultingState: result.resultingState };
  },

  isGameOver: (state) => state.isGameOver,

  analyze(state, _depth, puzzle) {
    const spec = goPuzzleSpec(puzzle);
    if (!spec) return { score: 0, bestMove: null };

    const { region, target, defender, playerColor } = spec;
    const sign = playerColor === 'white' ? 1 : -1;
    const decisive = (playerSucceeded: boolean) =>
      sign * (playerSucceeded ? GO_DECISIVE : -GO_DECISIVE);

    // The group is already off the board: the attacker got it, whoever that is.
    if (getStoneAt(state.board, target) !== defender) {
      return { score: decisive(playerColor !== defender), bestMove: null };
    }

    // Whoever is to move here is the opponent — the player has just moved. Ask
    // whether they can now get what they want.
    const opponentGoal = state.currentTurn === defender ? 'live' : 'kill';
    const verdict = tryTsumego(state, { region, target, goal: opponentGoal });

    // Too wide to settle. Saying nothing is the honest answer, and the runtime
    // already has copy for a move it cannot punish.
    if (!verdict) return { score: 0, bestMove: null };

    const punish = verdict.winningMoves.find((m) => m !== TSUMEGO_PASS) ?? null;
    return {
      score: decisive(!verdict.solved),
      bestMove: verdict.solved && punish ? { from: punish, to: punish } : null,
    };
  },

  // Legal points only — the pass is deliberately not offered. A lesson step
  // saying "play any move" must not be satisfiable by declining to play, and
  // `parseMove` cannot express a pass anyway.
  legalMoves: (state) => GoEngine.getAllLegalMoves(state).map((p) => ({ from: p, to: p })),

  describeMove(state, move) {
    const result = GoEngine.validateMove(state, move.to);
    if (!result.valid || !result.resultingState) {
      throw new Error(`Illegal go move: ${move.to}`);
    }
    const after = result.resultingState;
    const played = after.moveHistory[after.moveHistory.length - 1];
    return {
      piece: 'stone',
      captures: played?.captures.length ?? 0,
      check: false,
      // Two passes open the dead-stone review rather than ending the game, and
      // `isGameOver` stays false through it on purpose — so a placement is
      // never terminal in Go, which is the honest answer here.
      terminal: after.isGameOver,
    };
  },
};

/** The boundary a Go puzzle states, if it is one. */
function goPuzzleSpec(puzzle?: Puzzle): {
  region: string[];
  target: string;
  defender: GoColor;
  playerColor: GoColor;
} | null {
  if (!puzzle || puzzle.game !== 'go') return null;
  if (!puzzle.region?.length || !puzzle.target) return null;
  const playerColor = puzzle.playerColor as GoColor;
  return {
    region: puzzle.region,
    target: puzzle.target,
    // The solver is the attacker in a kill and the defender in a live.
    defender: puzzle.goal === 'kill' ? getOpponentColor(playerColor) : playerColor,
    playerColor,
  };
}

// ---------------------------------------------------------------------------

/** Rules by game, each keeping its own concrete state type. */
export const PUZZLE_RULES = {
  chess: chessPuzzleRules,
  checkers: checkersPuzzleRules,
  reversi: reversiPuzzleRules,
  go: goPuzzleRules,
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
