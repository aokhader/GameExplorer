// Engines are imported by relative path to their source module, never through
// the `@gameexplorer/shared` barrel; see sharedTypes.ts for why.
import { ReversiEngine } from '../../../shared/src/game-logic/reversi/engine';
import type { ReversiGameState } from '../../../shared/src/game-logic/reversi/types';

import { ReversiMoveSchema, NoOptionsSchema, type ReversiMove, type NoOptions } from '../schemas';
import type { ApplyResult, GameOver, OnlineGameAdapter } from './types';

const refuse = (reason: string) => ({ ok: false as const, reason });

/** Reversi ends on a full board or when neither side can move; most discs wins. */
function gameOverAfter(state: ReversiGameState): GameOver | null {
  if (!state.isGameOver) return null;
  return {
    result: state.winner === 'white' ? 'white_wins' : state.winner === 'black' ? 'black_wins' : 'draw',
    reason: 'board_full',
  };
}

/**
 * Reversi opens with black, and a player with no legal move passes. Clients
 * never send a pass: `apply` plays it for them, so after a move the turn may
 * come straight back to the mover. The clock reads `sideToMove`, not the
 * colour that just moved, which is how it follows both.
 */
export const reversiAdapter: OnlineGameAdapter<ReversiGameState, ReversiMove, NoOptions> = {
  gameType: 'reversi',
  online: true,
  optionsSchema: NoOptionsSchema,
  actionSchema: ReversiMoveSchema,

  newGame: () => ReversiEngine.newGame(),

  apply(state, color, action): ApplyResult<ReversiGameState, ReversiMove> {
    const parsed = ReversiMoveSchema.safeParse(action);
    if (!parsed.success) return refuse('Malformed move');
    if (state.isGameOver) return refuse('Game is already over');
    if (state.currentTurn !== color) return refuse('Not your turn');

    const move = parsed.data;
    const r = ReversiEngine.validateMove(state, move.position);
    if (!r.valid || !r.resultingState) return refuse(r.reason ?? 'Illegal move');

    let next = r.resultingState;
    // The auto-pass. The engine ends the game itself when neither side can
    // move, so a pass is only ever needed when the mover still can.
    if (!next.isGameOver && ReversiEngine.mustPass(next)) next = ReversiEngine.executePass(next);

    return { ok: true, state: next, action: move, gameOver: gameOverAfter(next) };
  },

  sideToMove: (state) => state.currentTurn,
  moveCount: (state) => state.moveHistory?.length ?? 0,

  // Ported from the Render server's persistence service. The key order is the
  // stored JSON's, so keep it: the golden test compares bytes.
  serializeMoves: (state) => (state?.moveHistory ?? []).map(m => ({ position: m.position, flipped: m.flipped, color: m.color })),
};
