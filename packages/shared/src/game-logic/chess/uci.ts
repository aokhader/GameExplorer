// UCI protocol helpers shared by web's Stockfish worker hook and mobile's
// native Arasan service. Pure string building/parsing only — no engine
// lifecycle here, since transports differ (Web Worker postMessage vs native
// TurboModule events).

import type { Move, PieceType, Position } from '../../types/chess.types';

/**
 * ELO seam between the in-house TS weak engine and a full UCI engine. On web,
 * bots below it run in the TS engine worker and at/above it hand off to
 * Stockfish. On mobile every tier now plays through the native Arasan engine,
 * but this still bounds the fallback: a build without the native module offers
 * only the sub-threshold tiles (the TS engine tops out at 1399). Stockfish's
 * UCI_Elo floor is 1320 and Arasan's is 1000, so 1400 sits cleanly above both.
 */
export const ENGINE_MIN_ELO = 1400;

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
export function engineMoveTimeMs(targetElo: number): number {
  return Math.round(500 + ((targetElo - ENGINE_MIN_ELO) / 1600) * 1000);
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

/**
 * The full `position` command for a game that began from an arbitrary position
 * rather than the initial one — a puzzle, or an analysis setup.
 *
 * `buildUciPositionCommand` is only correct for a state that descends from the
 * start position: a state seeded from a FEN has a history that doesn't, and
 * with an empty history the engine would happily evaluate the START position
 * instead of the one on the board.
 *
 * Prefer the startpos form when it applies — it hands the engine the full move
 * history, which is what its repetition detection needs.
 */
export function buildUciPositionFromFen(
  fen: string,
  moveHistory: readonly UciMoveInput[] = [],
): string {
  const base = `position fen ${fen}`;
  return moveHistory.length === 0
    ? base
    : `${base} moves ${moveHistory.map(uciMoveString).join(' ')}`;
}

export interface UciBestMove {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

export interface UciInfoScore {
  /** Centipawns from the perspective of the side to move, or null for a mate score. */
  cp: number | null;
  /** Mate in N from the perspective of the side to move, or null. */
  mate: number | null;
  /** Search depth this line reports. */
  depth: number;
  /** Principal variation as raw UCI move strings ("e2e4"), possibly empty. */
  pv: string[];
}

/**
 * Parse an engine `info` line carrying a score, or null for any other line
 * (engine chatter, `info` lines without a score, `bestmove`).
 *
 * Scores are side-to-move relative, exactly as the UCI spec defines them —
 * callers flip the sign themselves when they want a White-positive number.
 */
export function parseUciInfoScore(line: string): UciInfoScore | null {
  if (!line.startsWith('info') || !line.includes('score')) return null;

  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  if (!cpMatch && !mateMatch) return null;

  const depthMatch = line.match(/\bdepth (\d+)/);
  const pvMatch = line.match(/ pv (.+)/);

  return {
    cp: cpMatch ? parseInt(cpMatch[1], 10) : null,
    mate: mateMatch ? parseInt(mateMatch[1], 10) : null,
    depth: depthMatch ? parseInt(depthMatch[1], 10) : 0,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/).filter(Boolean) : [],
  };
}

/** Parse one UCI long-algebraic move string ("e2e4", "e7e8q"), or null. */
export function parseUciMoveString(moveStr: string): UciBestMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveStr)) return null;
  return {
    from: moveStr.substring(0, 2),
    to: moveStr.substring(2, 4),
    promotion: moveStr.length === 5 ? UCI_TO_PROMOTION[moveStr[4]] : undefined,
  };
}

/**
 * Parse an engine `bestmove` line into a move, or null when the line isn't a
 * usable bestmove (other engine chatter, or "bestmove (none)" from a finished
 * position).
 */
export function parseUciBestMove(line: string): UciBestMove | null {
  if (!line.startsWith('bestmove')) return null;
  const moveStr = line.split(/\s+/)[1];
  return moveStr ? parseUciMoveString(moveStr) : null;
}
