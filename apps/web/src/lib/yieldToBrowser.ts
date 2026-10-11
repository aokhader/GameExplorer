import type { SearchSignal, SlicedSearchOptions } from '@gameexplorer/shared';

/**
 * Hand the main thread back for one task, then carry on — the gap between the
 * slices of an in-house bot search (checkers and reversi; chess's runs in a
 * worker). Clicks, timers and renders are tasks too, so they run in the gaps,
 * and the browser paints whenever a frame is due.
 *
 * A message on a `MessageChannel`, as React's own scheduler yields, rather than
 * the shared default `setTimeout(0)`:
 * - browsers clamp a timer set from inside another timer to 4 ms once they
 *   nest five deep, and every gap in a sliced search is nested, so 8 ms slices
 *   would spend a third of the search waiting;
 * - a background tab can hold timers to about one a second, and a reversi
 *   search at the top level runs to well over a thousand slices. Messages are
 *   not throttled.
 *
 * Falls back to a timer where there is no `MessageChannel` (old browsers).
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    const port = gapPort();
    if (!port) {
      setTimeout(resolve, 0);
      return;
    }
    waiting.push(resolve);
    port.postMessage(null);
  });
}

/** One channel for every gap; each message wakes the oldest waiter. */
let channel: MessageChannel | null = null;
const waiting: Array<() => void> = [];

function gapPort(): MessagePort | null {
  if (typeof MessageChannel === 'undefined') return null;
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => waiting.shift()?.();
  }
  return channel.port2;
}

/** How every in-house bot and hint search on web runs: sliced, stoppable. */
export function slicedInBrowser(signal?: SearchSignal): SlicedSearchOptions {
  return { signal, yieldToHost: yieldToBrowser };
}
