import {
  GoEngine,
  analyzeGoPosition,
  getBestGoMove,
  type GoGameState,
  type NewGoGameOptions,
} from '@gameexplorer/shared';
import { saveGoGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from '../hooks/useLocalGame';

/**
 * A pass, in the loop's `from`/`to` vocabulary.
 *
 * `LocalMove` is a pair of board squares, which is all the other three games
 * ever need. Go's pass is a real move — it consumes the turn and two in a row
 * open the review — so it needs to travel through `handleMove` and the bot reply
 * like any other. Routing it as a sentinel square keeps the loop unchanged and
 * puts the pass on the timeline where the history scrubber can step over it.
 *
 * `pass` cannot collide with a point: board positions are a letter and a digit.
 */
export const GO_PASS = 'pass';

/**
 * Leave the dead-stone review and play on — the dispute path.
 *
 * Sentinels rather than a second action on the hook, for the same reason the
 * pass is one: they are state transitions the timeline should record, and
 * routing them through `handleMove` inherits every guard it already applies
 * (not from a reviewed position, not once the game is over, not twice).
 */
export const GO_RESUME = 'resume';

/**
 * Accept the review and count the board: `finalize:b2,b3,b4` — the sentinel,
 * then the points agreed dead, comma-separated. An empty list is `finalize:`,
 * which is what accepting a board with nothing marked looks like.
 */
export const GO_FINALIZE = 'finalize';

/** `finalize:` plus the marks, for `handleMove`. */
export function goFinalizeMove(dead: readonly string[]): string {
  return `${GO_FINALIZE}:${dead.join(',')}`;
}

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
 * A factory rather than a constant because the setup screen now chooses the
 * komi and the scoring rule, and `newGame()` takes no arguments by design — the
 * loop calls it on mount and on "play again", and neither call site knows what
 * the player picked. Both screens must `useMemo` this on those two values: the
 * adapter is a dependency of the bot turn, `handleMove`, `pass`, the hint and
 * the rating effect, so rebuilding it every render would re-fire all of them.
 *
 * Placements collapse `from === to`, as reversi's do. Three things are Go's own:
 * passing is a voluntary move (`allowsVoluntaryPass`), two passes open a review
 * that is not the end of the game (`isAwaitingReview`), and the review's two
 * outcomes ride the same sentinel channel as the pass.
 *
 * No rules live here — it adapts names and shapes over the shared engine, bot
 * and writer, exactly as `reversiAdapter` does. That is also the seam a native
 * Go engine would slot into later: replace `getBotMove`/`getHintMove` and no
 * screen on either platform changes.
 */
export function makeGoAdapter(options: NewGoGameOptions = {}): LocalGameAdapter<GoGameState> {
  return {
    gameType: 'go',
    newGame: () => GoEngine.newGame(options),
    currentTurn: (s) => s.currentTurn,
    isGameOver: (s) => s.isGameOver,
    winner: (s) => s.winner,

    validateMove: (s, from) => {
      if (from === GO_PASS) {
        if (s.isGameOver || s.phase !== 'playing') return { valid: false };
        return { valid: true, resultingState: GoEngine.executePass(s) };
      }
      if (from === GO_RESUME) {
        if (s.phase !== 'marking') return { valid: false };
        return { valid: true, resultingState: GoEngine.resumePlay(s) };
      }
      if (from.startsWith(`${GO_FINALIZE}:`)) {
        if (s.phase !== 'marking') return { valid: false };
        const dead = from.slice(GO_FINALIZE.length + 1).split(',').filter(Boolean);
        return { valid: true, resultingState: GoEngine.finalize(s, dead) };
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
    isAwaitingReview: (s) => s.phase === 'marking',

    save: ({ state, playerColor, result, difficulty, userId, options: saveOptions }) =>
      saveGoGame(state, playerColor, result, difficulty, userId, saveOptions),
  };
}

/** The default ruleset — 9×9, area scoring, 7.5 komi. */
export const goAdapter = makeGoAdapter();

/**
 * The setup tables live in `goSetup.ts`, which imports no database client — a
 * card that renders five komi buttons should not pull Supabase into the bundle.
 * Re-exported here so existing call sites keep working.
 */
export {
  GO_DIFFICULTY_LEVELS,
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_RATED_KOMI,
  GO_RATED_SIZE,
  GO_SCORING_OPTIONS,
  GO_TRAINING_ELO_BOUNDS,
  goEloLabel,
  goKomiLabel,
  goActiveRow,
  goRatedEligibility,
  goRulesetSummary,
  goTimelineRows,
} from './goSetup';
export type { GoHistoryRow } from './goSetup';
