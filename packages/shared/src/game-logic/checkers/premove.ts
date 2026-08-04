// Premoves — a move queued while the opponent is still to move, played the
// instant the turn comes back. See the chess module for the shape of the idea;
// checkers differs in two ways worth knowing:
//
//   * A premove's target is offered whether or not a jump is possible today.
//     Mandatory capture is decided by the position that arrives, not this one,
//     and the opponent's move is exactly what creates (or removes) the jump.
//   * Only single-hop targets are offered. A multi-jump chain is one legal move
//     ending at its final landing square, so a premove aimed at the first hop of
//     a chain is simply dropped on arrival rather than silently playing a
//     sequence of captures the player never picked.

import type { CheckersGameState, CheckersPiece } from './types';
import {
  positionToCoordinates,
  coordinatesToPosition,
  isValidCoordinates,
  getPieceAt,
} from './utils';
import { CheckersEngine } from './engine';

/** A queued move: the square to lift from, and the square to land on. */
export interface CheckersPremove {
  from: string;
  to: string;
}

/** Men premove forward only; kings, like their moves, go all four ways. */
function premoveDirections(piece: CheckersPiece): Array<{ dr: number; dc: number }> {
  if (piece.type === 'king') {
    return [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 },
      { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
  }
  const forward = piece.color === 'white' ? 1 : -1;
  return [{ dr: forward, dc: 1 }, { dr: forward, dc: -1 }];
}

/**
 * Squares the piece on `from` may be premoved to: the diagonal step and the
 * jump landing square in each of its directions, occupancy ignored — the
 * opponent's reply is what decides which of them exists.
 *
 * Empty when the square is empty or holds a piece of the side already to move.
 */
export function getCheckersPremoveDestinations(state: CheckersGameState, from: string): string[] {
  const piece = getPieceAt(state.board, from);
  if (!piece || piece.color === state.currentTurn) return [];

  const { row, col } = positionToCoordinates(from);
  const dests: string[] = [];

  for (const { dr, dc } of premoveDirections(piece)) {
    for (const distance of [1, 2]) {
      const target = { row: row + dr * distance, col: col + dc * distance };
      if (isValidCoordinates(target)) dests.push(coordinatesToPosition(target));
    }
  }

  return dests;
}

/**
 * Arrival check — is the queued move one of the moves actually legal now?
 * Matching on from/to (rather than replaying the hop) is what keeps mandatory
 * capture and maximal-chain rules authoritative: they're already baked into the
 * engine's move list.
 */
export function isCheckersPremoveLegal(state: CheckersGameState, premove: CheckersPremove): boolean {
  if (state.isGameOver) return false;
  const piece = getPieceAt(state.board, premove.from);
  if (!piece || piece.color !== state.currentTurn) return false;
  return CheckersEngine.getAllLegalMoves(state).some(
    m => m.from === premove.from && m.to === premove.to,
  );
}
