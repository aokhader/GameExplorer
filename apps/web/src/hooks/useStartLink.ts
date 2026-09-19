'use client';

import { useEffect, useState } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

/**
 * `?start=1` — a Play link from the launcher, a game page or the first-run
 * picker, asking the setup screen to start straight away with the setup it
 * remembers (`lib/gameRoutes.ts`).
 *
 * It waits until the screen knows whether an unfinished game of this kind is
 * waiting, and then starts only if none is. A new game replaces the saved one,
 * and a rated one closes only by finishing or resigning — so a link, which
 * cannot ask, never starts over it; the setup screen shows the Continue card
 * instead. (The tour's links used to start at once and could do exactly that.)
 *
 * Returns true while the answer is pending, so the screen can stay blank rather
 * than paint its form for a frame on the way to the board.
 */
export function useStartLink(
  unfinished: { hydrated: boolean; saved: unknown | null },
  start: () => void,
): boolean {
  const [awaiting, setAwaiting] = useState(false);

  // A layout effect, so a link's first paint is the blank frame, not the form.
  useIsomorphicLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).get('start') === '1') setAwaiting(true);
  }, []);

  useEffect(() => {
    if (!awaiting || !unfinished.hydrated) return;
    setAwaiting(false);
    if (!unfinished.saved) start();
    // `start` is read when the answer arrives; re-running for a new closure
    // would start a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, unfinished.hydrated]);

  return awaiting;
}
