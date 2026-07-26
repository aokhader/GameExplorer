// Standard Algebraic Notation — the compact move text players read on Lichess
// and chess.com ("e4", "Nf3", "Bxf6", "O-O", "exd8=Q+"). Shared so web and
// mobile print move lists identically.

import { ChessEngine } from './engine';
import { getPieceAt } from './utils';
import type { ChessGameState, Move, PieceType } from '../../types/chess.types';

const PIECE_LETTER: Record<PieceType, string> = {
  pawn: '',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
};

/**
 * SAN for a single move, given the position it was played FROM and (optionally)
 * the one it produced.
 *
 * The "before" state is required because disambiguation depends on what else was
 * legal at the time: `Nf3` is only correct if one knight could reach f3, and
 * `Nbd2` / `N1d2` / `Nb1d2` otherwise. Callers holding a timeline (state per
 * ply) have this for free — `timeline[i]` is the position before
 * `moveHistory[i]`.
 *
 * `stateAfter` supplies the `+` / `#` suffix. The engine records check and mate
 * on the resulting STATE, never on the `Move` itself, so without it a mating
 * move prints unsuffixed. Pass `timeline[i + 1]`.
 *
 * Falls back to the plain `from`-`to` form if the move doesn't match the state
 * (e.g. mismatched arguments), so a bad pairing degrades to something readable
 * rather than throwing inside a render.
 */
export function toSan(
  stateBefore: ChessGameState,
  move: Move,
  stateAfter?: ChessGameState,
): string {
  if (move.isCastling) {
    return suffix(move, stateAfter, move.castlingSide === 'queenside' ? 'O-O-O' : 'O-O');
  }

  const piece = getPieceAt(stateBefore.board, move.from) ?? move.piece;
  if (!piece) return `${move.from}-${move.to}`;

  const isCapture = !!move.capturedPiece || !!move.isEnPassant;
  const promotion = move.promotion ? `=${PIECE_LETTER[move.promotion] || 'Q'}` : '';

  if (piece.type === 'pawn') {
    // Captures name the departure file ("exd5"); quiet pushes are bare ("e4").
    const body = isCapture ? `${move.from[0]}x${move.to}` : move.to;
    return suffix(move, stateAfter, `${body}${promotion}`);
  }

  const body = `${PIECE_LETTER[piece.type]}${disambiguate(stateBefore, move, piece.type)}${
    isCapture ? 'x' : ''
  }${move.to}`;
  return suffix(move, stateAfter, `${body}${promotion}`);
}

/**
 * "+" for check, "#" for mate. Read off the resulting state when it's available;
 * the `Move` flags are the fallback for callers that populate them themselves.
 */
function suffix(move: Move, stateAfter: ChessGameState | undefined, body: string): string {
  const mate = stateAfter?.isCheckmate ?? move.isCheckmate;
  const check = stateAfter?.isCheck ?? move.isCheck;
  if (mate) return `${body}#`;
  if (check) return `${body}+`;
  return body;
}

/**
 * The shortest origin hint that identifies which piece moved: nothing when it's
 * the only one that could get there, else the file, else the rank, else the
 * whole square.
 */
function disambiguate(state: ChessGameState, move: Move, type: PieceType): string {
  const rivals = ChessEngine.getAllLegalMoves(state).filter((m) => {
    if (m.to !== move.to || m.from === move.from) return false;
    const other = getPieceAt(state.board, m.from);
    return other?.type === type;
  });
  if (rivals.length === 0) return '';

  const [file, rank] = [move.from[0], move.from[1]];
  if (!rivals.some((m) => m.from[0] === file)) return file;
  if (!rivals.some((m) => m.from[1] === rank)) return rank;
  return move.from;
}

/**
 * SAN for a whole timeline — `timeline[i]` being the position before
 * `moveHistory[i]`, exactly as the local-game loop stores it. Returns one string
 * per move played.
 */
export function timelineToSan(timeline: ChessGameState[]): string[] {
  const history = timeline[timeline.length - 1]?.moveHistory ?? [];
  return history.map((move, i) =>
    timeline[i] ? toSan(timeline[i], move, timeline[i + 1]) : `${move.from}-${move.to}`,
  );
}
