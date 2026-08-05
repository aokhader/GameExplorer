// Position serialization for checkers, in the FEN tag body that PDN files use:
//
//     B:WK10,18,24,27:B12,16,K22
//
// Side to move, then White's pieces, then Black's, as the 1–32 dark-square
// numbers `pdn.ts` already defines. A leading `K` marks a king.
//
// We write squares in ascending numeric order regardless of rank, so a position
// has exactly one encoding and `encode(decode(x)) === x` holds. The parser is
// looser than the writer: it takes the two piece lists in either order, any
// square order, and either case of the king marker — PDN in the wild does all
// three, and normalizing on the way in is what makes the round trip stable.
//
// Unlike chess FEN this carries no clocks and no history — a decoded state is a
// fresh position with an empty move history, which is exactly what a puzzle
// start position is.

import { fromPdnSquare } from './pdn';
import { getPieceAt, setPieceAt, createInitialBoard } from './utils';
import type { CheckersBoard, CheckersColor, CheckersGameState } from './types';

/** Every piece of one color as `18,24,K10`, ascending by square number. */
function encodeSide(board: CheckersBoard, color: CheckersColor): string {
  const entries: { square: number; king: boolean }[] = [];

  for (let square = 1; square <= 32; square++) {
    const position = fromPdnSquare(square)!;
    const piece = getPieceAt(board, position);
    if (piece?.color !== color) continue;
    entries.push({ square, king: piece.type === 'king' });
  }

  return entries
    .sort((a, b) => a.square - b.square)
    .map(({ square, king }) => (king ? `K${square}` : `${square}`))
    .join(',');
}

export function stateToCheckersFen(state: CheckersGameState): string {
  const side = state.currentTurn === 'white' ? 'W' : 'B';
  return `${side}:W${encodeSide(state.board, 'white')}:B${encodeSide(state.board, 'black')}`;
}

/** Parse one side's list onto the board. Mutates nothing — returns a new board. */
function decodeSide(board: CheckersBoard, list: string, color: CheckersColor): CheckersBoard {
  if (list === '') return board;

  let next = board;
  for (const raw of list.split(',')) {
    const token = raw.trim();
    const king = token[0] === 'K' || token[0] === 'k';
    const square = Number(king ? token.slice(1) : token);

    const position = fromPdnSquare(square);
    if (position === null) {
      throw new Error(`Invalid checkers FEN: '${token}' is not a square number 1-32`);
    }
    if (getPieceAt(next, position) !== null) {
      throw new Error(`Invalid checkers FEN: square ${square} listed twice`);
    }

    next = setPieceAt(next, position, { type: king ? 'king' : 'man', color });
  }
  return next;
}

export function checkersFenToState(fen: string): CheckersGameState {
  const parts = fen.trim().split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid checkers FEN: expected <side>:W<pieces>:B<pieces>');
  }

  const [side, first, second] = parts.map((p) => p.trim());

  if (side !== 'W' && side !== 'B') {
    throw new Error(`Invalid checkers FEN: side to move must be W or B, got '${side}'`);
  }

  // The two piece lists may be given in either order — `:W…:B…` is what we
  // write, but PDN in the wild does both.
  const lists: Partial<Record<CheckersColor, string>> = {};
  for (const section of [first, second]) {
    const tag = section[0];
    if (tag === 'W') lists.white = section.slice(1);
    else if (tag === 'B') lists.black = section.slice(1);
    else throw new Error(`Invalid checkers FEN: piece list must start with W or B, got '${section}'`);
  }
  if (lists.white === undefined || lists.black === undefined) {
    throw new Error('Invalid checkers FEN: needs one W list and one B list');
  }

  // A side with no pieces has already lost, so it can never be a start position.
  // Rejecting here keeps a typo'd list from decoding into a game that is over
  // before the first move.
  if (lists.white === '' || lists.black === '') {
    throw new Error('Invalid checkers FEN: both sides must have at least one piece');
  }

  let board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  board = decodeSide(board, lists.white, 'white');
  board = decodeSide(board, lists.black, 'black');

  return {
    board,
    currentTurn: side === 'W' ? 'white' : 'black',
    moveHistory: [],
    isGameOver: false,
    winner: null,
    movesSinceCapture: 0,
  };
}

/** The standard opening position, as a convenience for tests and fixtures. */
export const CHECKERS_START_FEN = stateToCheckersFen({
  board: createInitialBoard(),
  currentTurn: 'white',
  moveHistory: [],
  isGameOver: false,
  winner: null,
  movesSinceCapture: 0,
});
