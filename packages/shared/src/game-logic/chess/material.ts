// Captured-piece + material-balance helpers, shared by web and mobile so both
// platforms show the same trays and the same "+3" advantage badge.

import type { ChessGameState, Color, PieceType } from '../../types/chess.types';

/**
 * Classic pawn-unit piece values, the ones players expect to see next to a
 * capture tray. Deliberately NOT the engine's centipawn table (weakEngine's
 * PIECE_VALUE), which prices bishops above knights for search purposes — a
 * material badge reading "+0.1" after an even knight-for-bishop trade would
 * just look broken.
 */
export const MATERIAL_VALUES: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0, // Never captured.
};

/** Tray order — cheapest first, the convention on Lichess and chess.com. */
const TRAY_ORDER: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

export interface MaterialSummary {
  /** Pieces White has captured (so, Black's pieces), cheapest first. */
  white: PieceType[];
  /** Pieces Black has captured (so, White's pieces), cheapest first. */
  black: PieceType[];
  /**
   * Material balance in pawn units: positive = White is ahead, negative =
   * Black, 0 = level.
   */
  advantage: number;
}

/**
 * Captured pieces per side and the material balance for a position.
 *
 * The trays come from `moveHistory` (every move carries its `capturedPiece`,
 * en passant included) so they list exactly what left the board. The advantage
 * is counted off the board instead of off the trays, because promotions change
 * material without any capture — a player who queens a pawn is +8 even though
 * nothing was taken, and only a board count reflects that.
 */
export function summarizeMaterial(state: ChessGameState): MaterialSummary {
  const captured: Record<Color, PieceType[]> = { white: [], black: [] };
  for (const move of state.moveHistory) {
    if (!move.capturedPiece) continue;
    // The captured piece's color is the victim's, so the capturer is the other.
    captured[move.capturedPiece.color === 'white' ? 'black' : 'white'].push(
      move.capturedPiece.type,
    );
  }

  let advantage = 0;
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = MATERIAL_VALUES[piece.type];
      advantage += piece.color === 'white' ? value : -value;
    }
  }

  return {
    white: sortForTray(captured.white),
    black: sortForTray(captured.black),
    advantage,
  };
}

function sortForTray(pieces: PieceType[]): PieceType[] {
  return [...pieces].sort((a, b) => TRAY_ORDER.indexOf(a) - TRAY_ORDER.indexOf(b));
}
