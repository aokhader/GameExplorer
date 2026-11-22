/* eslint-disable @typescript-eslint/no-explicit-any */
// The Render server's serializeMoves, copied byte for byte from
// apps/api/src/services/persistence.service.ts, where it is not exported.
// Importing that module would start a Supabase client and a logger, so the
// golden test runs this copy instead, and `serializeMoves.golden.test.ts`
// checks that the text between the markers still appears verbatim in the
// API's source. Delete both with apps/api.
import type { GameType } from '../../sharedTypes';

// ── BEGIN verbatim ──
/** Serialise moveHistory the same way packages/db does, per game type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMoves(gameType: GameType, state: any): unknown[] {
  const history: any[] = state?.moveHistory ?? [];
  if (gameType === 'chess') {
    return history.map(m => ({
      from: m.from, to: m.to, piece: m.piece, capturedPiece: m.capturedPiece,
      isCastling: m.isCastling, castlingSide: m.castlingSide,
      promotion: m.promotion, isCheck: m.isCheck, isCheckmate: m.isCheckmate,
    }));
  }
  if (gameType === 'checkers') {
    return history.map(m => ({
      from: m.from, to: m.to, path: m.path, captures: m.captures,
      isKingPromotion: m.isKingPromotion,
    }));
  }
  return history.map(m => ({ position: m.position, flipped: m.flipped, color: m.color }));
}
// ── END verbatim ──

export { serializeMoves as legacySerializeMoves };
