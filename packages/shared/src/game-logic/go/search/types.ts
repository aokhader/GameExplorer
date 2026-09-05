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
}

/** What a backend reports about the position it just searched. */
export interface GoSearchResult {
  /** The point to play. Never null — passing is decided above the search. */
  position: string;
  /** Win probability for the side to move, from the playouts. */
  winRate: number;
  /** Estimated final area lead for BLACK, komi included. Positive = black ahead. */
  scoreLead: number;
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

/** Hard ceiling on one search, whatever the iteration budget says. */
export const SEARCH_CEILING_MS = 3000;

/** How long a backend may run before yielding to the host. */
export const SLICE_MS = 8;

export const yieldToHost = (): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

export function abortError(): Error {
  const error = new Error('Go search aborted');
  error.name = 'AbortError';
  return error;
}
