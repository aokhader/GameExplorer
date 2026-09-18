/**
 * Each local game's rules, without a bot — enough to replay a saved game and to
 * record its result from anywhere, not just from the screen that played it.
 *
 * A Continue card on the launcher can resign a rated game without opening its
 * board, and web's hand-rolled game screens restore a saved game without the
 * shared loop. Both need the same four things: start a game, apply a move, read
 * the result, write it. The platform adapters (native's `chessAdapter` and
 * friends, and `makeGoAdapter` here) spread these and add only what is genuinely
 * theirs — which engine answers a bot move, what a new game has to cancel.
 *
 * Deliberately **no engine and no search**: importing this must not start
 * Arasan, load Stockfish or spin a worker.
 */

import {
  CheckersEngine,
  ChessEngine,
  ReversiEngine,
  type CheckersGameState,
  type ChessGameState,
  type PieceType,
  type ReversiGameState,
} from '@gameexplorer/shared';
import { saveCheckersGame, saveGame, saveReversiGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from '../hooks/useLocalGame';
import { makeGoAdapter } from './goAdapter';
import { parseSetup } from './localSetup';
import type { LocalAction, UnfinishedGame } from './unfinishedGame';

/** The part of an adapter that is the game itself rather than an opponent for it. */
export type LocalGameRules<S> = Pick<
  LocalGameAdapter<S>,
  | 'gameType'
  | 'newGame'
  | 'currentTurn'
  | 'isGameOver'
  | 'winner'
  | 'validateMove'
  | 'mustPass'
  | 'executePass'
  | 'allowsVoluntaryPass'
  | 'isAwaitingReview'
  | 'save'
>;

export const CHESS_RULES: LocalGameRules<ChessGameState> = {
  gameType: 'chess',
  newGame: () => ChessEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isCheckmate || s.isStalemate || s.isDraw,
  // Checkmate = the side to move is mated → the other colour wins. Stalemate and
  // the other draws have no winner.
  winner: (s) => (s.isCheckmate ? (s.currentTurn === 'white' ? 'black' : 'white') : null),
  validateMove: (s, from, to, promotion) => {
    const r = ChessEngine.validateMove(s, from, to, false, promotion as PieceType | undefined);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveGame(state, playerColor, result, difficulty, userId, options),
};

export const CHECKERS_RULES: LocalGameRules<CheckersGameState> = {
  gameType: 'checkers',
  newGame: () => CheckersEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isGameOver,
  winner: (s) => s.winner,
  validateMove: (s, from, to) => {
    const r = CheckersEngine.validateMove(s, from, to);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveCheckersGame(state, playerColor, result, difficulty, userId, options),
};

export const REVERSI_RULES: LocalGameRules<ReversiGameState> = {
  gameType: 'reversi',
  newGame: () => ReversiEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isGameOver,
  winner: (s) => s.winner,
  // A placement is one square, so the loop passes it as both ends of the move.
  validateMove: (s, from) => {
    const r = ReversiEngine.validateMove(s, from);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  mustPass: (s) => ReversiEngine.mustPass(s),
  executePass: (s) => ReversiEngine.executePass(s),
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveReversiGame(state, playerColor, result, difficulty, userId, options),
};

/**
 * A game's actions, read back off its own move history.
 *
 * For screens that keep a timeline of positions rather than running the shared
 * loop — web's chess, checkers and reversi screens and its training pages. Every
 * position carries the history that produced it, so the moves to save come from
 * the live position rather than a second record that could fall out of step.
 * Replaying these reproduces the position (pinned in `unfinishedGame.test.ts`).
 */
export function actionsFromHistory(
  game: 'chess' | 'checkers' | 'reversi',
  state: ChessGameState | CheckersGameState | ReversiGameState,
): LocalAction[] {
  switch (game) {
    case 'chess':
      return (state as ChessGameState).moveHistory.map((m) => ({
        from: m.from,
        to: m.to,
        ...(m.promotion ? { promotion: m.promotion } : {}),
      }));
    case 'checkers':
      return (state as CheckersGameState).moveHistory.map((m) => ({ from: m.from, to: m.to }));
    case 'reversi':
      // A pass is recorded as a move to nowhere.
      return (state as ReversiGameState).moveHistory.map((m) =>
        m.position === null ? { pass: true as const } : { from: m.position, to: m.position },
      );
    default: {
      const unreachable: never = game;
      return unreachable;
    }
  }
}

/**
 * The rules a saved game was played under. Go's come from the setup it was
 * started with — a 13×13 game replayed on the default 9×9 board would fail on
 * its first move off the smaller board.
 */
export function localRulesFor(saved: Pick<UnfinishedGame, 'game' | 'mode' | 'setup'>): LocalGameRules<unknown> {
  switch (saved.game) {
    case 'chess':
      return CHESS_RULES as LocalGameRules<unknown>;
    case 'checkers':
      return CHECKERS_RULES as LocalGameRules<unknown>;
    case 'reversi':
      return REVERSI_RULES as LocalGameRules<unknown>;
    case 'go': {
      const { size, komi, scoring } = parseSetup('go', saved.mode, JSON.stringify(saved.setup));
      return makeGoAdapter({ size, komi, scoring }) as LocalGameRules<unknown>;
    }
    default: {
      const unreachable: never = saved.game;
      return unreachable;
    }
  }
}
