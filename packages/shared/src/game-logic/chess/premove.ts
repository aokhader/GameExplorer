// Premoves — a move queued while the opponent is still to move, played the
// instant the turn comes back.
//
// Two halves, both pure so every board (web + native) shares them:
//
//   1. `getChessPremoveDestinations` — what the player may aim at. This CANNOT
//      be the legal-move list: those are generated for the side to move, and
//      the position the premove will land in doesn't exist yet. So it's raw
//      piece mobility over an empty board — blockers are ignored, because the
//      opponent's reply can vacate or occupy any square in between. Same model
//      chess UIs have used for years: aim generously, discard on arrival.
//   2. `isChessPremoveLegal` — the arrival check, run against the real position
//      once the opponent has moved. A premove that didn't survive is dropped.

import type { ChessGameState, Position, PieceType, Piece, Color } from '../../types/chess.types';
import { positionToCoordinates, coordinatesToPosition, getPieceAt } from './utils';
import { ChessEngine } from './engine';

/** A queued move. `promotion` is chosen when the premove is set, not on arrival. */
export interface ChessPremove {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

/** Home rank of a colour's king — where a castling premove may start. */
function homeRow(color: Color): number {
  return color === 'white' ? 0 : 7;
}

/**
 * Can `piece` conceivably travel fromRow/fromCol → toRow/toCol, ignoring every
 * other piece on the board? Sliders are unblocked on purpose (see the module
 * note); pawns get their double step and both capture diagonals whether or not
 * anything stands there today.
 */
function isReachable(
  piece: Piece,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  castling: { kingSide: boolean; queenSide: boolean },
): boolean {
  const dRow = toRow - fromRow;
  const dCol = toCol - fromCol;
  const absRow = Math.abs(dRow);
  const absCol = Math.abs(dCol);

  switch (piece.type) {
    case 'pawn': {
      const forward = piece.color === 'white' ? 1 : -1;
      const startRank = piece.color === 'white' ? 1 : 6;
      // One step (straight or either capture diagonal) …
      if (dRow === forward && absCol <= 1) return true;
      // … or the double step off the starting rank.
      return dRow === forward * 2 && dCol === 0 && fromRow === startRank;
    }
    case 'knight':
      return (absRow === 1 && absCol === 2) || (absRow === 2 && absCol === 1);
    case 'bishop':
      return absRow === absCol;
    case 'rook':
      return dRow === 0 || dCol === 0;
    case 'queen':
      return absRow === absCol || dRow === 0 || dCol === 0;
    case 'king': {
      if (Math.max(absRow, absCol) === 1) return true;
      // Castling: the king's two-square hop is only offered from its home
      // square, and only while the matching right survives.
      if (fromRow !== homeRow(piece.color) || fromCol !== 4 || toRow !== fromRow) return false;
      if (toCol === 6) return castling.kingSide;
      if (toCol === 2) return castling.queenSide;
      return false;
    }
    default:
      return false;
  }
}

/**
 * Squares the piece on `from` may be premoved to. Empty when the square is
 * empty or holds a piece of the side that is already to move (that player
 * should be making a real move, not queueing one).
 *
 * Own-occupied destinations are deliberately kept: the opponent may capture
 * that piece, which turns the premove into a perfectly legal recapture.
 */
export function getChessPremoveDestinations(state: ChessGameState, from: Position): Position[] {
  const piece = getPieceAt(state.board, from);
  if (!piece || piece.color === state.currentTurn) return [];

  const { row, col } = positionToCoordinates(from);
  const castling = {
    kingSide: piece.color === 'white'
      ? state.castlingRights.whiteKingSide
      : state.castlingRights.blackKingSide,
    queenSide: piece.color === 'white'
      ? state.castlingRights.whiteQueenSide
      : state.castlingRights.blackQueenSide,
  };

  const dests: Position[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === row && c === col) continue;
      if (isReachable(piece, row, col, r, c, castling)) {
        dests.push(coordinatesToPosition({ row: r, col: c }));
      }
    }
  }
  return dests;
}

/** True if this pawn premove lands on the back rank and so needs a promotion piece. */
export function isChessPremovePromotion(state: ChessGameState, from: Position, to: Position): boolean {
  const piece = getPieceAt(state.board, from);
  if (!piece || piece.type !== 'pawn') return false;
  const { row } = positionToCoordinates(to);
  return (piece.color === 'white' && row === 7) || (piece.color === 'black' && row === 0);
}

/**
 * Arrival check — is the queued move legal in the position that actually
 * showed up? Runs full validation (`skipGameEndCheck` on: the caller re-runs
 * the real move right after, and mate detection is the expensive half).
 */
export function isChessPremoveLegal(state: ChessGameState, premove: ChessPremove): boolean {
  if (state.isCheckmate || state.isStalemate || state.isDraw) return false;
  const piece = getPieceAt(state.board, premove.from);
  if (!piece || piece.color !== state.currentTurn) return false;
  return ChessEngine.validateMove(state, premove.from, premove.to, true, premove.promotion).valid;
}
