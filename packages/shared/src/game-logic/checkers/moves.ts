import type { CheckersBoard, CheckersPiece, CheckersColor, CheckersMove } from './types';
import {
  positionToCoordinates,
  coordinatesToPosition,
  isValidCoordinates,
  getPieceAt,
  setPieceAt,
} from './utils';

type Direction = { dr: number; dc: number };

/** Men move forward only; kings move in all four diagonal directions. */
function getMoveDirections(piece: CheckersPiece): Direction[] {
  if (piece.type === 'king') {
    return [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 },
      { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
  }
  const forward = piece.color === 'white' ? 1 : -1;
  return [{ dr: forward, dc: 1 }, { dr: forward, dc: -1 }];
}

/** Returns all immediate (single-hop) jumps available from `pos`. */
function getImmediateJumps(
  board: CheckersBoard,
  pos: string,
  piece: CheckersPiece,
): Array<{ midPos: string; landPos: string }> {
  const { row, col } = positionToCoordinates(pos);
  const result: Array<{ midPos: string; landPos: string }> = [];

  for (const { dr, dc } of getMoveDirections(piece)) {
    const midCoords = { row: row + dr, col: col + dc };
    const landCoords = { row: row + dr * 2, col: col + dc * 2 };

    if (!isValidCoordinates(midCoords) || !isValidCoordinates(landCoords)) continue;

    const midPos = coordinatesToPosition(midCoords);
    const landPos = coordinatesToPosition(landCoords);

    const midPiece = getPieceAt(board, midPos);
    if (!midPiece || midPiece.color === piece.color) continue;
    if (getPieceAt(board, landPos) !== null) continue;

    result.push({ midPos, landPos });
  }

  return result;
}

/**
 * Recursively builds all maximal jump chains from `from`.
 * Standard English draughts rules:
 *   - A man that reaches the king row mid-chain stops there (crowned, turn ends).
 *   - A king continues jumping in all directions.
 *   - You must always take the maximal jump sequence (can't stop mid-chain voluntarily).
 */
function buildJumpChains(
  board: CheckersBoard,
  from: string,
  piece: CheckersPiece,
): Array<{ path: string[]; captures: string[] }> {
  const jumps = getImmediateJumps(board, from, piece);
  if (jumps.length === 0) return [];

  const chains: Array<{ path: string[]; captures: string[] }> = [];

  for (const { midPos, landPos } of jumps) {
    const { row: landRow } = positionToCoordinates(landPos);

    const isPromotion =
      piece.type === 'man' &&
      ((piece.color === 'white' && landRow === 7) ||
        (piece.color === 'black' && landRow === 0));

    if (isPromotion) {
      // Chain stops at promotion square — piece is crowned, turn ends
      chains.push({ path: [landPos], captures: [midPos] });
    } else {
      // Simulate the capture and continue the chain from the landing square
      const simBoard = setPieceAt(
        setPieceAt(setPieceAt(board, from, null), midPos, null),
        landPos,
        piece,
      );
      const continuations = buildJumpChains(simBoard, landPos, piece);

      if (continuations.length > 0) {
        for (const cont of continuations) {
          chains.push({
            path: [landPos, ...cont.path],
            captures: [midPos, ...cont.captures],
          });
        }
      } else {
        // No further jumps — this is a complete chain
        chains.push({ path: [landPos], captures: [midPos] });
      }
    }
  }

  return chains;
}

/** Returns all legal single-step (non-capture) destinations for a piece. */
function getStepDestinations(board: CheckersBoard, pos: string, piece: CheckersPiece): string[] {
  const { row, col } = positionToCoordinates(pos);
  const steps: string[] = [];

  for (const { dr, dc } of getMoveDirections(piece)) {
    const target = { row: row + dr, col: col + dc };
    if (!isValidCoordinates(target)) continue;
    const targetPos = coordinatesToPosition(target);
    if (getPieceAt(board, targetPos) === null) {
      steps.push(targetPos);
    }
  }

  return steps;
}

/**
 * Returns all moves for a single piece at `pos`.
 * Caller is responsible for enforcing the mandatory-capture rule globally.
 */
export function getMovesForPiece(board: CheckersBoard, pos: string): CheckersMove[] {
  const piece = getPieceAt(board, pos);
  if (!piece) return [];

  const chains = buildJumpChains(board, pos, piece);
  if (chains.length > 0) {
    return chains.map(({ path, captures }) => {
      const to = path[path.length - 1];
      const { row: toRow } = positionToCoordinates(to);
      const isKingPromotion =
        piece.type === 'man' &&
        ((piece.color === 'white' && toRow === 7) ||
          (piece.color === 'black' && toRow === 0));
      return { from: pos, to, path, captures, isKingPromotion };
    });
  }

  return getStepDestinations(board, pos, piece).map(to => ({
    from: pos,
    to,
    path: [to],
    captures: [],
  }));
}

/**
 * Returns all legal moves for the given colour.
 * Enforces mandatory capture: if any piece can jump, ONLY jump moves are returned.
 */
export function getAllLegalMoves(board: CheckersBoard, color: CheckersColor): CheckersMove[] {
  const all: CheckersMove[] = [];
  const jumps: CheckersMove[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;

      const pos = coordinatesToPosition({ row, col });
      for (const move of getMovesForPiece(board, pos)) {
        all.push(move);
        if (move.captures.length > 0) jumps.push(move);
      }
    }
  }

  return jumps.length > 0 ? jumps : all;
}
