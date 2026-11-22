// Engines are imported by relative path to their source module, never through
// the `@gameexplorer/shared` barrel; see sharedTypes.ts for why.
import { ChessEngine } from '../../../shared/src/game-logic/chess/engine';
import type { ChessGameState, PieceType } from '../../../shared/src/types/chess.types';

import { ChessMoveSchema, NoOptionsSchema, type ChessMove, type NoOptions } from '../schemas';
import type { ApplyResult, GameOver, OnlineGameAdapter } from './types';

const refuse = (reason: string) => ({ ok: false as const, reason });

function isOver(state: ChessGameState): boolean {
  return state.isCheckmate || state.isStalemate || state.isDraw;
}

/**
 * The engine's `isDraw` is the fifty-move rule or stalemate, so a draw that is
 * not a stalemate is reported as `fifty_move`, as the Render server did.
 */
function gameOverAfter(state: ChessGameState, mover: 'white' | 'black'): GameOver | null {
  if (state.isCheckmate) return { result: mover === 'white' ? 'white_wins' : 'black_wins', reason: 'checkmate' };
  if (state.isStalemate || state.isDraw) return { result: 'draw', reason: state.isStalemate ? 'stalemate' : 'fifty_move' };
  return null;
}

export const chessAdapter: OnlineGameAdapter<ChessGameState, ChessMove, NoOptions> = {
  gameType: 'chess',
  online: true,
  optionsSchema: NoOptionsSchema,
  actionSchema: ChessMoveSchema,

  newGame: () => ChessEngine.newGame(),

  apply(state, color, action): ApplyResult<ChessGameState, ChessMove> {
    const parsed = ChessMoveSchema.safeParse(action);
    if (!parsed.success) return refuse('Malformed move');
    if (isOver(state)) return refuse('Game is already over');
    if (state.currentTurn !== color) return refuse('Not your turn');

    const move = parsed.data;
    const r = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion as PieceType | undefined);
    if (!r.valid) return refuse(r.reason ?? 'Illegal move');
    // A promotion sent without its piece. The engine answers "valid, ask the
    // player which piece" and makes no move; the Render server read that as a
    // move and failed on the missing state.
    if (r.needsPromotion || !r.resultingState) return refuse('Choose a piece to promote to');

    const next = r.resultingState;
    return { ok: true, state: next, action: move, gameOver: gameOverAfter(next, color) };
  },

  sideToMove: (state) => state.currentTurn,
  moveCount: (state) => state.moveHistory?.length ?? 0,

  // Ported from the Render server's persistence service. The key order is the
  // stored JSON's, so keep it: the golden test compares bytes.
  serializeMoves: (state) => (state?.moveHistory ?? []).map(m => ({
    from: m.from, to: m.to, piece: m.piece, capturedPiece: m.capturedPiece,
    isCastling: m.isCastling, castlingSide: m.castlingSide,
    promotion: m.promotion, isCheck: m.isCheck, isCheckmate: m.isCheckmate,
  })),
};
