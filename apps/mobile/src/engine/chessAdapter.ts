import {
  ChessEngine,
  getBestMoveElo,
  type ChessGameState,
  type PieceType,
} from '@gameexplorer/shared';
import { saveGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from './useLocalGame';
import {
  getEngineBestMove,
  engineNewGame,
  isEngineAvailable,
  cancelEngineSearch,
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
 * Odds a bot plays a random legal move instead of Arasan's choice — the
 * weakening below Arasan's 1000 `UCI_Elo` floor, which can't be expressed by
 * strength alone. Zero at 1000+, where Arasan's own strength limiting takes
 * over.
 *
 * A continuous ramp rather than a couple of buckets, because custom ratings can
 * land anywhere: a player who dials in 850 should get a bot measurably stronger
 * than one who dials in 650. The anchors keep the two presets exactly where they
 * were calibrated — Beginner (600) hangs pieces about half its moves, Novice
 * (900) blunders about a quarter — and interpolate between them.
 */
const BLUNDER_ANCHORS: [elo: number, chance: number][] = [
  [400, 0.6],
  [600, 0.5],
  [900, 0.25],
  [1000, 0],
];

function blunderChanceForElo(elo: number): number {
  if (elo >= 1000) return 0;
  if (elo <= 400) return 0.6;
  for (let i = 1; i < BLUNDER_ANCHORS.length; i++) {
    const [hiElo, hiChance] = BLUNDER_ANCHORS[i];
    if (elo > hiElo) continue;
    const [loElo, loChance] = BLUNDER_ANCHORS[i - 1];
    const t = (elo - loElo) / (hiElo - loElo);
    return loChance + t * (hiChance - loChance);
  }
  return 0;
}

/**
 * A uniformly random legal move for the side to move, or null in a terminal
 * position. Auto-queens a promoting pawn (getAllLegalMoves reports promotions
 * as their from/to only, and no picker runs for a bot move).
 */
function randomLegalMove(
  state: ChessGameState,
): { from: string; to: string; promotion?: string } | null {
  const moves = ChessEngine.getAllLegalMoves(state);
  if (moves.length === 0) return null;
  const { from, to } = moves[Math.floor(Math.random() * moves.length)];
  const piece = state.board[Number(from[1]) - 1][from.charCodeAt(0) - 97];
  const toRank = Number(to[1]);
  const promotion = piece?.type === 'pawn' && (toRank === 1 || toRank === 8) ? 'queen' : undefined;
  return { from, to, promotion };
}

/**
 * Chess binding for `useLocalGame`. Every bot tier plays through the native
 * Arasan engine (async, offline — the engine ships in the app). Arasan's
 * `UCI_Elo` floor is 1000, so the two sub-1000 tiers (Beginner 600, Novice 900)
 * are weakened with occasional random moves (see `blunderChanceForElo`); 1200+
 * map straight onto `UCI_Elo`. A dev client built before the engine was linked
 * has no native module and falls back to the in-house TS engine, which the
 * setup screen keeps to sub-1400 tiles to match its calibration.
 *
 * Screens gate the bot turn on `useEngineNative().isReady` so a request never
 * fires before the engine handshake completes. `validateMove` threads the
 * optional promotion piece; the board resolves the picker before it ever calls
 * with a promotion move.
 */
export const chessAdapter: LocalGameAdapter<ChessGameState> = {
  gameType: 'chess',
  newGame: () => {
    // Abandon whatever the bot was thinking about — its answer applies to a
    // position that no longer exists — then clear the engine's tables (both
    // no-ops when it isn't running).
    cancelEngineSearch('New game started');
    engineNewGame();
    return ChessEngine.newGame();
  },
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isCheckmate || s.isStalemate || s.isDraw,
  // Checkmate = the side to move is mated → the other color wins. Stalemate /
  // draw → null (no winner).
  winner: (s) => (s.isCheckmate ? (s.currentTurn === 'white' ? 'black' : 'white') : null),
  validateMove: (s, from, to, promotion) => {
    const r = ChessEngine.validateMove(s, from, to, false, promotion as PieceType | undefined);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  getBotMove: async (s, elo) => {
    // A dev client without the native module falls back to the in-house engine.
    if (!isEngineAvailable()) {
      const m = getBestMoveElo(s, elo);
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    // Below Arasan's 1000 floor, occasionally substitute a random move so the
    // beginner tiers still play weak; otherwise Arasan plays (clamped + short
    // move time for the low tiers, see chessEngineNative).
    const blunder = blunderChanceForElo(elo);
    if (blunder > 0 && Math.random() < blunder) {
      const rnd = randomLegalMove(s);
      if (rnd) return rnd;
    }
    return getEngineBestMove(s, elo);
  },
  // No blunder ramp here — a paid-for hint always gets the engine's real answer.
  getHintMove: async (s, elo) => {
    if (!isEngineAvailable()) {
      const m = getBestMoveElo(s, elo);
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    return getEngineBestMove(s, elo);
  },
  // A little above the player's own level: good moves rather than perfect ones,
  // so the hint stays instructive instead of unreachable. Matches web.
  hintElo: (botElo) => Math.min(3000, botElo + 200),
  thinkTimeForElo,
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveGame(state, playerColor, result, difficulty, userId, options),
};
