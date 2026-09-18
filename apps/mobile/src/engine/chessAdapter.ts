import {
  CHESS_HINT_SEARCH_MS,
  chessBotConfig,
  getBestMoveElo,
  type ChessGameState,
} from '@gameexplorer/shared';
import { CHESS_RULES } from '@gameexplorer/client/game/localRules';
import type { LocalGameAdapter } from './useLocalGame';
import {
  getEngineBestMove,
  getEngineEvaluation,
  engineNewGame,
  isEngineAvailable,
  cancelEngineSearch,
  whenEngineReady,
} from './chessEngineNative';

/** Bot pacing by strength — mirrors web's `useStockfish` `thinkTimeForElo`. */
function thinkTimeForElo(elo: number): number {
  if (elo < 800) return 400;
  if (elo < 1200) return 650;
  if (elo < 1400) return 900;
  if (elo < 1800) return 1100;
  return 1400;
}

/**
 * How long a hint waits for Arasan to finish starting. The engine loads its
 * network on the first game of the session, so a hint tapped straight away can
 * arrive before the engine is ready.
 */
const HINT_ENGINE_WAIT_MS = 20_000;

/**
 * Chess binding for `useLocalGame`. Which engine plays at which rating is
 * decided in one place — `chessBotConfig` in packages/shared — and this file
 * only obeys it. See that module for the measurements.
 *
 * The short version: below the ladder's seam the in-house TS engine plays,
 * because Arasan cannot be made that weak without re-enabling its unbounded
 * blunder mode, which is what made the old "1500" lose a piece on one move in
 * six. At and above the seam Arasan plays, pinned above that gate, with search
 * depth as the strength dial.
 *
 * This replaced a random-move ramp that tried to weaken Arasan below its
 * `UCI_Elo` floor of 1000. It is gone rather than retuned: it stacked random
 * blunders on top of an engine that was already blundering unboundedly at those
 * settings, so the two lowest tiers were weakened twice over.
 *
 * Screens gate the bot turn on `useEngineNative().isReady` so a request never
 * fires before the engine handshake completes. `validateMove` threads the
 * optional promotion piece; the board resolves the picker before it ever calls
 * with a promotion move.
 */
export const chessAdapter: LocalGameAdapter<ChessGameState> = {
  // Rules and writer shared with anything that replays or resigns a saved chess
  // game away from this screen. Only the engine is this binary's own.
  ...CHESS_RULES,
  newGame: () => {
    // Abandon whatever the bot was thinking about — its answer applies to a
    // position that no longer exists — then clear the engine's tables (both
    // no-ops when it isn't running).
    cancelEngineSearch('New game started');
    engineNewGame();
    return CHESS_RULES.newGame();
  },
  getBotMove: async (s, elo) => {
    // Ratings the ladder assigns to the in-house engine, plus any rating at all
    // on a dev client with no native module linked.
    if (chessBotConfig(elo).engine === 'ts' || !isEngineAvailable()) {
      const m = getBestMoveElo(s, elo);
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    return getEngineBestMove(s, elo);
  },
  // A hint is the best move in the position, found by the strongest engine the
  // app has — Arasan, searching with strength limiting off — whatever the
  // player's rating, which it is handed and ignores. It never settles for the
  // in-house engine: if Arasan is still starting, the hint waits for it, and if
  // Arasan cannot run at all the screen disables hints rather than sell a
  // weaker one.
  getHintMove: async (s) => {
    await whenEngineReady(HINT_ENGINE_WAIT_MS);
    const { bestMove } = await getEngineEvaluation(s, CHESS_HINT_SEARCH_MS);
    if (!bestMove) throw new Error('The engine has no move in this position');
    return bestMove;
  },
  thinkTimeForElo,
};
