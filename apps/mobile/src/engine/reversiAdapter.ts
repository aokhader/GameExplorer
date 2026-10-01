import { botThinkMs, getBestReversiMoveSliced, type ReversiGameState } from '@gameexplorer/shared';
import { REVERSI_RULES } from '@gameexplorer/client/game/localRules';
import type { LocalGameAdapter } from './useLocalGame';
import { slicedOnJsThread } from './yieldToJsQueue';

/**
 * Reversi binding for `useLocalGame`. Reversi moves are a single placement, so
 * the loop's `from`/`to` pair is collapsed to one position (`from === to`). The
 * `mustPass`/`executePass` pair lets the loop auto-pass when a side has no legal
 * move — the one reversi-specific bit the engine-agnostic loop needs. No rules
 * live here; it only adapts names/shapes over the shared engine + bot + writer.
 */
export const reversiAdapter: LocalGameAdapter<ReversiGameState> = {
  // Rules, forced pass and writer shared with anything that replays or resigns
  // a saved reversi game away from this screen.
  ...REVERSI_RULES,
  // Sliced: the search shares the JS thread with the board's touch handlers,
  // and the depth-5 tiers take seconds a move on a phone (tens of seconds in an
  // open midgame). Unsliced, the whole screen froze for that long.
  getBotMove: async (s, elo, signal) => {
    const { position } = await getBestReversiMoveSliced(s, elo, slicedOnJsThread(signal));
    return { from: position, to: position };
  },
  getHintMove: async (s, elo, signal) => {
    const { position } = await getBestReversiMoveSliced(s, elo, slicedOnJsThread(signal));
    return { from: position, to: position };
  },
  // Always the engine's strongest square, as on web.
  hintElo: () => 2000,
  thinkTimeForElo: () => botThinkMs(),
};
