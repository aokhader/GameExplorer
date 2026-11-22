import type { z } from 'zod';
import type { EndReason, GameResult, GameType, PlayerColor } from '../sharedTypes';

/** How a game ended, as the room reports it. */
export interface GameOver {
  result: GameResult;
  reason: EndReason;
}

export type ApplyResult<S, A> =
  | {
      ok: true;
      /** The position after the move, and after any pass the rules then force. */
      state: S;
      /** The action as parsed: keys the client added are gone. Broadcast this one. */
      action: A;
      /** Set when this move ended the game. */
      gameOver: GameOver | null;
    }
  | {
      ok: false;
      /** Why the move was refused, in words a player can read. */
      reason: string;
    };

/**
 * Everything a game room needs to know about one game. The room calls only
 * these pure functions: it never touches an engine, and clients send intents
 * (actions), never states.
 *
 * Rules every adapter keeps, checked by `conformance.ts`:
 *   - States are plain JSON. A state read back from storage plays exactly like
 *     the one that was written.
 *   - Nothing is mutated: not the state, not the action.
 *   - The same actions from the same start always give the same states. No
 *     clock and no randomness inside.
 *   - `apply` never throws on anything a client can send. A malformed action is
 *     refused before any engine sees it.
 */
export interface OnlineGameAdapter<S = unknown, A = unknown, O = unknown> {
  readonly gameType: GameType;
  /**
   * Offered in matchmaking and invites. An adapter can exist, and pass the
   * conformance suite, before its game is opened to online play.
   */
  readonly online: boolean;
  /** Options for `newGame`. The three classic games take none. */
  readonly optionsSchema: z.ZodType<O>;
  /** One move of this game, as a client sends it. */
  readonly actionSchema: z.ZodType<A>;

  newGame(options: O): S;
  /**
   * Plays `action` for `color`. `action` is untrusted: it is checked against
   * `actionSchema` here, so a move for another game, or one with an off-board
   * square, is refused rather than handed to the engine. Any pass the rules
   * then force (reversi, when the opponent has no move) is applied before
   * returning, so the result's `sideToMove` is who really moves next.
   */
  apply(state: S, color: PlayerColor, action: unknown): ApplyResult<S, A>;
  /**
   * The side whose clock should run. Null when the position gives the move to
   * nobody, which none of today's games ever does; Go's scoring phase will.
   */
  sideToMove(state: S): PlayerColor | null;
  /** Moves played so far, forced passes included. Gates `abort_game`. */
  moveCount(state: S): number;
  /** The move list as the `games.moves` column stores it. */
  serializeMoves(state: S): unknown[];
}
