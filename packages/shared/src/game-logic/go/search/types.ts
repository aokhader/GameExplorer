/**
 * The seam between "what move should the bot play" and "how is that worked out".
 *
 * Two backends ship. `classic` is the original uniform-playout MCTS that Go
 * launched with; `pattern` is the one that made 13×13 and 19×19 worth offering.
 * They are interchangeable at this interface, and everything above it — the
 * adapter, the local-game loop, training hints, puzzle refutation, review —
 * knows about neither.
 *
 * **This interface is also the plan for a neural backend.** KataGo's own code
 * and its `kata1` networks are MIT, and the older `g170` run (including the
 * 3.6 MB `b6c96`) is CC0, so a policy/value backend running under
 * `onnxruntime-web` and `onnxruntime-react-native` is licence-clean for this
 * repo and would implement exactly this shape. What is NOT clean is the
 * `extra_networks` page on katagotraining.org, whose third-party nets are
 * documented as having come with no agreed terms — the same missing-licence
 * trap that cost us `stream_fix`. Anyone picking that work up starts here.
 */

import type { GoGameState } from '../types';

export interface GoSearchOptions {
  /**
   * Playout budget. Strength in a Monte-Carlo search is bought with playouts,
   * so this is the ladder's knob — a search depth would mean nothing here.
   */
  iterations: number;
  /**
   * Seed for reproducible play. Omitted → a fresh seed per call, so repeated
   * games differ; supplied → the same game every time, which is what the tests
   * and the bot-vs-bot harness rely on.
   */
  seed?: number;
  /**
   * Cancels the search. Structurally typed rather than `AbortSignal` so this
   * package keeps needing no DOM lib; a real `AbortSignal` satisfies it.
   */
  signal?: { aborted: boolean };
  /**
   * How to hand the thread back between slices. The default is a zero-delay
   * `setTimeout`, which is right for browsers and Node. React Native needs its
   * own, for the reason `utils/slicedSearch.ts` gives: its timers fire only on
   * frame boundaries, so a gap lasts until the next frame — 9 to 35 ms on an
   * idle screen and about 40 on the game screen, against an 8 ms slice (Pixel 8
   * emulator, dev build, Sep 2026). `SEARCH_CEILING_MS` counts that wait, so on
   * the game screen the Master tier stopped at about 540 of its 4,000 playouts
   * (at the 3 s ceiling of the time).
   */
  yieldToHost?: () => Promise<void>;
}

/** What a backend reports about the position it just searched. */
export interface GoSearchResult {
  /** The point to play. Never null — passing is decided above the search. */
  position: string;
  /** Win probability for the side to move, from the playouts. */
  winRate: number;
  /** Estimated final area lead for BLACK, komi included. Positive = black ahead. */
  scoreLead: number;
  /**
   * Playouts the search actually completed. Below `iterations` only when
   * `SEARCH_CEILING_MS` cut it short — a slow device, or long gaps between
   * slices — which makes the bot weaker than its tier says. Reported because
   * desktop never shows it, so nothing else would.
   */
  playouts: number;
}

export interface GoSearch {
  /**
   * Which backend this is. Reported so a bot-vs-bot result, a test failure or a
   * device log says *which engine played*, rather than leaving it to be inferred
   * from the strength of the moves.
   */
  readonly id: 'classic' | 'pattern';
  /** A one-line description for anything that surfaces the engine to a person. */
  readonly label: string;
  search(
    state: GoGameState,
    candidates: readonly string[],
    options: GoSearchOptions,
  ): Promise<GoSearchResult>;
}

/**
 * Hard ceiling on one search, whatever the iteration budget says.
 *
 * Desktop never reaches it: every tier finishes its budget in well under a
 * second there. It exists for slow devices, so a search degrades to a weaker
 * move instead of thinking for as long as the playouts take. Five seconds
 * rather than the three it was, because on the Pixel 8 emulator (dev build,
 * game screen) the Master tier's 4,000 playouts take about 3.8–4.1 s: three
 * seconds stopped it near 3,000, and four would still clip the slower moves.
 * A ceiling that truncates the top tier makes it weaker than its label on
 * exactly the devices nobody measures.
 */
export const SEARCH_CEILING_MS = 5000;

/** How long a backend may run before yielding to the host. */
export const SLICE_MS = 8;

/** The default gap between slices: one task, so queued input and renders run first. */
export const nextTask = (): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

export function abortError(): Error {
  const error = new Error('Go search aborted');
  error.name = 'AbortError';
  return error;
}
