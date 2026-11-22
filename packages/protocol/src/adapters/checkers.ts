// Engines are imported by relative path to their source module, never through
// the `@gameexplorer/shared` barrel; see sharedTypes.ts for why.
import { CheckersEngine } from '../../../shared/src/game-logic/checkers/engine';
import type { CheckersGameState } from '../../../shared/src/game-logic/checkers/types';

import { CheckersMoveSchema, NoOptionsSchema, type CheckersMove, type NoOptions } from '../schemas';
import type { ApplyResult, GameOver, OnlineGameAdapter } from './types';

const refuse = (reason: string) => ({ ok: false as const, reason });

/** A side with no move loses; a game over with no winner is the move-limit draw. */
function gameOverAfter(state: CheckersGameState): GameOver | null {
  if (!state.isGameOver) return null;
  return {
    result: state.winner === 'white' ? 'white_wins' : state.winner === 'black' ? 'black_wins' : 'draw',
    reason: state.winner ? 'no_moves' : 'fifty_move',
  };
}

export const checkersAdapter: OnlineGameAdapter<CheckersGameState, CheckersMove, NoOptions> = {
  gameType: 'checkers',
  online: true,
  optionsSchema: NoOptionsSchema,
  actionSchema: CheckersMoveSchema,

  newGame: () => CheckersEngine.newGame(),

  apply(state, color, action): ApplyResult<CheckersGameState, CheckersMove> {
    const parsed = CheckersMoveSchema.safeParse(action);
    if (!parsed.success) return refuse('Malformed move');
    if (state.isGameOver) return refuse('Game is already over');
    if (state.currentTurn !== color) return refuse('Not your turn');

    // The engine finds the whole move, every jump of a chain included, from
    // the first and last squares.
    const move = parsed.data;
    const r = CheckersEngine.validateMove(state, move.from, move.to);
    if (!r.valid || !r.resultingState) return refuse(r.reason ?? 'Illegal move');

    const next = r.resultingState;
    return { ok: true, state: next, action: move, gameOver: gameOverAfter(next) };
  },

  sideToMove: (state) => state.currentTurn,
  moveCount: (state) => state.moveHistory?.length ?? 0,

  // Ported from the Render server's persistence service. The key order is the
  // stored JSON's, so keep it: the golden test compares bytes.
  serializeMoves: (state) => (state?.moveHistory ?? []).map(m => ({
    from: m.from, to: m.to, path: m.path, captures: m.captures,
    isKingPromotion: m.isKingPromotion,
  })),
};
