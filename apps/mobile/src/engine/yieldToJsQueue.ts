import type { SearchSignal, SlicedSearchOptions } from '@gameexplorer/shared';

/**
 * React Native's JS task queue (the new architecture's `RuntimeScheduler`),
 * as installed on the global object. React's own `scheduler` package drives
 * renders through the same object on native.
 */
interface RuntimeScheduler {
  unstable_scheduleCallback(priority: unknown, callback: () => void): unknown;
  unstable_LowPriority: unknown;
}

const runtimeScheduler = (globalThis as { nativeRuntimeScheduler?: RuntimeScheduler })
  .nativeRuntimeScheduler;

/**
 * Give the JS thread back for one turn, then carry on — the gap between the
 * slices of an in-house bot search.
 *
 * Not `setTimeout(fn, 0)`: React Native only fires timers on frame boundaries,
 * so every gap cost a full frame (16.7 ms measured on the Pixel 8 emulator),
 * and 8 ms slices more than doubled a search's wall time. A task on the
 * runtime's own queue comes back in microseconds.
 *
 * Low priority is what makes it a real gap rather than a slower microtask. The
 * queue runs the most urgent task first, and touch events, `runOnJS` calls from
 * the gesture worklets, timers and React renders all queue ahead of it, so the
 * search only ever gets the time nothing else wanted.
 *
 * Falls back to a timer where the runtime scheduler is missing (Jest, the old
 * architecture).
 */
export function yieldToJsQueue(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (runtimeScheduler) {
      runtimeScheduler.unstable_scheduleCallback(runtimeScheduler.unstable_LowPriority, () =>
        resolve(),
      );
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** How every in-house bot and hint search on mobile runs: sliced, stoppable. */
export function slicedOnJsThread(signal?: SearchSignal): SlicedSearchOptions {
  return { signal, yieldToHost: yieldToJsQueue };
}
