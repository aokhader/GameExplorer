/**
 * Running a game-tree search without freezing the thread it runs on.
 *
 * The in-house minimax bots (chess below the Arasan seam, checkers, reversi) are
 * plain depth-first searches. On mobile they run on the JavaScript thread, the
 * same thread that answers the boards' touch handlers, and one search there
 * measured 2.6 s on average for chess at 1300 and up to 50 s for reversi at 2000
 * (Pixel 8 emulator, dev build, Sep 2026). A piece the player picked up during
 * that time did not lift until the search finished. Web's checkers and reversi
 * bots run on the page's main thread, where reversi at 2000 took up to 13.7 s a
 * move on a desktop and the page could not respond at all meanwhile.
 *
 * So each search is written once, as a generator that can stop at any interior
 * node, and is driven one of two ways:
 *
 * - `runSearch` runs it straight through and never stops. This is the
 *   synchronous API every other caller keeps (web's chess worker, review,
 *   puzzles, the calibration scripts).
 * - `runSearchSliced` runs it a few milliseconds at a time and gives the thread
 *   back between slices, so queued touches and renders run in the gaps. Every
 *   in-house bot and hint on mobile uses it, and web's checkers and reversi.
 *
 * **Slicing cannot change the move.** The generator *is* the search; the driver
 * only decides when to resume it. Nodes are visited in the same order with the
 * same windows, and the evaluation's `Math.random` draws happen in the same
 * order, which is what web's e2e `seedRandom` relies on to replay a bot line.
 * Tests pin it: a seeded search returns the same move after the same number of
 * draws whether or not it was sliced. What slicing does allow is *other* code
 * drawing from `Math.random` between slices, which would shift the engine's
 * share of a seeded sequence. On web's bot pages nothing else draws from it
 * once they have loaded (React DOM and Supabase take four draws while their
 * modules load; bot pacing has its own generator, see `bots/pacing.ts`), and
 * nothing seeds it on mobile. Keep it that way, or the pinned e2e lines stop
 * replaying.
 *
 * Go's MCTS does its own slicing (see `go/search/types.ts`), because a playout
 * loop has a natural place to stop and a recursive search does not.
 */

/**
 * Asked by a search at each interior node: is this slice used up? A search that
 * hears `true` yields once and carries on from the same node when resumed.
 */
export type ShouldPause = () => boolean;

/** A search written to stop and resume. It yields nothing; it only pauses. */
export type PausableSearch<T> = (shouldPause: ShouldPause) => Generator<void, T, void>;

/**
 * Cancels a sliced search. Structurally typed, as Go's is, so this package still
 * needs no DOM lib; a real `AbortSignal` satisfies it.
 */
export interface SearchSignal {
  readonly aborted: boolean;
}

export interface SlicedSearchOptions {
  /** Checked between slices. An aborted search rejects with an `AbortError`. */
  signal?: SearchSignal;
  /** How long one slice may run. `0` stops at every interior node (tests use it). */
  sliceMs?: number;
  /**
   * How to hand the thread back between slices. It must let queued input and
   * renders run first, so a microtask will not do. The default is a zero-delay
   * `setTimeout`, which is right for browsers and Node. React Native needs its
   * own: its timers only fire on frame boundaries, so every gap there costs a
   * whole frame (measured at 16.7 ms on Android), which more than doubled a
   * search's wall time with 8 ms slices.
   */
  yieldToHost?: () => Promise<void>;
}

/**
 * The default slice, the same as Go's: a touch that arrives mid-slice waits at
 * most about half a frame.
 */
export const SEARCH_SLICE_MS = 8;

const NEVER: ShouldPause = () => false;

/** Run a search to the end in one go. */
export function runSearch<T>(search: PausableSearch<T>): T {
  const steps = search(NEVER);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * A task, not a microtask: touch events, timers and renders are queued as
 * tasks, and a microtask would run ahead of all of them.
 */
const nextTask = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Run a search in slices of about `sliceMs`, handing the thread back between
 * them with `yieldToHost`.
 */
export async function runSearchSliced<T>(
  search: PausableSearch<T>,
  { signal, sliceMs = SEARCH_SLICE_MS, yieldToHost = nextTask }: SlicedSearchOptions = {},
): Promise<T> {
  let sliceEnd = 0;
  const steps = search(() => Date.now() >= sliceEnd);
  for (;;) {
    if (signal?.aborted) throw searchAborted();
    sliceEnd = Date.now() + sliceMs;
    const step = steps.next();
    if (step.done) return step.value;
    await yieldToHost();
  }
}

/**
 * The rejection an aborted search settles with. The name is what callers check,
 * as they do for a cancelled engine search, so "the game moved on" never reaches
 * the console as an error.
 */
function searchAborted(): Error {
  const error = new Error('Search aborted');
  error.name = 'AbortError';
  return error;
}
