// UCI protocol helpers shared by web's Stockfish worker hook and mobile's
// native Stockfish service. Pure string building/parsing only — no engine
// lifecycle here, since transports differ (Web Worker postMessage vs native
// TurboModule events).

import type { Move, PieceType, Position } from '../../types/chess.types';

/**
 * ELO threshold above which bots hand off to Stockfish. Below it the in-house
 * TS weak engine plays (its calibration tops out at 1399); Stockfish's own
 * UCI_Elo floor is 1320, so 1400 keeps a clean seam between the two.
 */
export const STOCKFISH_MIN_ELO = 1400;

/** Stockfish's supported UCI_Elo range (see the official UCI docs). */
export const STOCKFISH_UCI_ELO_MIN = 1320;
export const STOCKFISH_UCI_ELO_MAX = 3190;

export function clampStockfishElo(targetElo: number): number {
  return Math.max(STOCKFISH_UCI_ELO_MIN, Math.min(STOCKFISH_UCI_ELO_MAX, targetElo));
}

/**
 * Search budget per move. Higher targets need deeper searches to actually
 * reach the configured UCI_Elo strength; the formula matches what web shipped
 * with (500ms at 1400 rising to ~1500ms at 3000+).
 */
export function stockfishMoveTimeMs(targetElo: number): number {
  return Math.round(500 + ((targetElo - STOCKFISH_MIN_ELO) / 1600) * 1000);
}

const PROMOTION_TO_UCI: Record<PieceType, string> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  // Not legal promotion targets, but keep the map total over PieceType.
  pawn: '',
  king: '',
};

const UCI_TO_PROMOTION: Record<string, PieceType> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

export type UciMoveInput = Pick<Move, 'from' | 'to' | 'promotion'>;

/**
 * A single move in UCI long algebraic notation, e.g. "e2e4", "e7e8q".
 * Note: knight promotions are "n", not the first letter of "knight" — mapping
 * through PROMOTION_TO_UCI (not `promotion[0]`) is what makes underpromotions
 * to knight survive the round trip.
 */
export function uciMoveString(move: UciMoveInput): string {
  const promo = move.promotion ? PROMOTION_TO_UCI[move.promotion] : '';
  return `${move.from}${move.to}${promo}`;
}

/** The full `position` command for a game replayed from the start position. */
export function buildUciPositionCommand(moveHistory: readonly UciMoveInput[]): string {
  if (moveHistory.length === 0) return 'position startpos';
  return `position startpos moves ${moveHistory.map(uciMoveString).join(' ')}`;
}

export interface UciBestMove {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

/**
 * Parse an engine `bestmove` line into a move, or null when the line isn't a
 * usable bestmove (other engine chatter, or "bestmove (none)" from a finished
 * position).
 */
export function parseUciBestMove(line: string): UciBestMove | null {
  if (!line.startsWith('bestmove')) return null;
  const moveStr = line.split(/\s+/)[1];
  if (!moveStr || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveStr)) return null;
  return {
    from: moveStr.substring(0, 2),
    to: moveStr.substring(2, 4),
    promotion: moveStr.length === 5 ? UCI_TO_PROMOTION[moveStr[4]] : undefined,
  };
}
