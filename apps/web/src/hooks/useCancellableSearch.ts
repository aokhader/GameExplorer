'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * The bot or hint search a screen has in flight, so whatever makes it moot — a
 * reset, a resignation, the player moving under a hint, leaving the page — can
 * stop it. A sliced search (`lib/yieldToBrowser.ts`) checks the signal between
 * slices and rejects with an `AbortError`. Left alone it would run on for
 * nobody (for seconds, at reversi's top level), sharing the thread with the
 * game that replaced it.
 *
 * One search per hook at a time: the screens' thinking/hinting flags already
 * keep a second one from starting.
 */
export function useCancellableSearch() {
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  return useMemo(
    () => ({
      /** The signal for the search about to start. */
      start(): AbortSignal {
        const controller = new AbortController();
        inFlight.current = controller;
        return controller.signal;
      },
      /** Stop the search in flight, if there is one. */
      cancel(): void {
        inFlight.current?.abort();
        inFlight.current = null;
      },
    }),
    [],
  );
}
