import {
  GoEngine,
  analyzeGoPosition,
  getBestGoMove,
  type GoGameState,
} from '@gameexplorer/shared';
import { saveGoGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from '../hooks/useLocalGame';

/**
 * A pass, in the loop's `from`/`to` vocabulary.
 *
 * `LocalMove` is a pair of board squares, which is all the other three games
 * ever need. Go's pass is a real move — it consumes the turn and two in a row
 * end the game — so it needs to travel through `handleMove` and the bot reply
 * like any other. Routing it as a sentinel square keeps the loop unchanged and
 * puts the pass on the timeline where the history scrubber can step over it.
 *
 * `pass` cannot collide with a point: board positions are a letter and a digit.
 */
export const GO_PASS = 'pass';

/**
 * Bot pacing. Deliberately shorter padding than the other three games use: this
 * bot's search really does take a few hundred milliseconds at the upper tiers
 * (MCTS spends its budget on playouts, where alpha-beta returns early), and the
 * loop takes the LONGER of the search and this delay. Padding a 600 ms search
 * out to 1400 ms would just make every strong bot feel sluggish.
 */
function thinkTimeForElo(elo: number): number {
  if (elo < 700) return 400;
  if (elo < 1000) return 500;
  if (elo < 1400) return 600;
  return 700;
}

/**
 * Go binding for `useLocalGame`, shared by web and mobile.
 *
 * Placements collapse `from === to`, as reversi's do. Two things are Go's own:
 * passing is a voluntary move (`allowsVoluntaryPass`), and `validateMove`
 * understands the pass sentinel so a bot's pass, a player's Pass button, and the
 * loop's forced auto-pass all reach `GoEngine.executePass` by the same route.
 *
 * No rules live here — it adapts names and shapes over the shared engine, bot
 * and writer, exactly as `reversiAdapter` does. That is also the seam a native
 * Go engine would slot into later: replace `getBotMove`/`getHintMove` and no
 * screen on either platform changes.
 */
export const goAdapter: LocalGameAdapter<GoGameState> = {
  gameType: 'go',
  newGame: () => GoEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isGameOver,
  winner: (s) => s.winner,

  validateMove: (s, from) => {
    if (from === GO_PASS) {
      if (s.isGameOver) return { valid: false };
      return { valid: true, resultingState: GoEngine.executePass(s) };
    }
    const result = GoEngine.validateMove(s, from);
    return { valid: result.valid, resultingState: result.resultingState };
  },

  getBotMove: async (s, elo) => {
    const { position } = await getBestGoMove(s, elo);
    const move = position ?? GO_PASS;
    return { from: move, to: move };
  },

  /**
   * The engine's best effort, for the paid training hint. Answering "pass" is a
   * real answer here and worth the two rating points — in Go, knowing the game
   * is over is a skill — so it comes back as the sentinel rather than as a
   * point the player should not play.
   */
  getHintMove: async (s) => {
    const { position } = await analyzeGoPosition(s);
    const move = position ?? GO_PASS;
    return { from: move, to: move };
  },

  // The hint always asks at full strength; `analyzeGoPosition` has its own
  // budget and ignores the bot's rating entirely.
  hintElo: () => 2000,

  thinkTimeForElo,

  // Genuinely rare in Go — it needs a board where every point is self-capture or
  // ko — but the loop still needs the hook so a player who truly cannot move is
  // passed automatically instead of being stuck.
  mustPass: (s) => GoEngine.mustPass(s),
  executePass: (s) => GoEngine.executePass(s),
  allowsVoluntaryPass: true,

  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveGoGame(state, playerColor, result, difficulty, userId, options),
};

/** Bot tiers offered on the setup screens, matching the engine's ELO bands. */
export const GO_DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Plays nearly at random', icon: '🟢' },
  { elo: 800, label: 'Casual', description: 'Takes what it can, misses shape', icon: '🔵' },
  { elo: 1100, label: 'Club', description: 'Reads captures and simple life', icon: '🟡' },
  { elo: 1400, label: 'Strong', description: 'Fights for territory and eyes', icon: '🟠' },
  { elo: 1700, label: 'Expert', description: 'Consistent whole-board judgement', icon: '🔴' },
  { elo: 2000, label: 'Master', description: 'The engine at full strength', icon: '⚫' },
] as const;

/** Range the rating-matched training bot is clamped into — the calibrated span. */
export const GO_TRAINING_ELO_BOUNDS = { min: 400, max: 2000 };

export function goEloLabel(elo: number): string {
  return GO_DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}
