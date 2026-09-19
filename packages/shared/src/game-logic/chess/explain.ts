import type { IllegalMoveReason } from '../../constants/onboarding';
import type { ChessGameState, Position } from '../../types/chess.types';
import { getPossibleMoves } from './moves';
import { getPieceAt } from './utils';

/**
 * Why a chess move the board refused is not allowed — the first-time tip's
 * reason (`ILLEGAL_MOVE_COPY`, `project-docs/ux-fix-ideas.md` §4.4).
 *
 * Call it only for a move the board has already found illegal. The piece's own
 * reach says whether it could get there at all; a move it *could* make but may
 * not is one that leaves its own king attacked, and which of the three ways that
 * happens is told apart by the position: already in check, a king walking into
 * an attack, or a piece pinned to its king.
 *
 * Null when it is not the mover's piece — a tap on an opponent's piece is not a
 * move anyone tried.
 */
export function illegalMoveReason(state: ChessGameState, from: Position, to: Position): IllegalMoveReason | null {
  const piece = getPieceAt(state.board, from);
  if (!piece || piece.color !== state.currentTurn) return null;
  const reach = getPossibleMoves(state.board, from, true, state.enPassantTarget);
  if (!reach.includes(to)) return 'cantReach';
  if (state.isCheck) return 'inCheck';
  return piece.type === 'king' ? 'intoCheck' : 'pinned';
}
