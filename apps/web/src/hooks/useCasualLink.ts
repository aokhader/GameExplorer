'use client';

import { useState } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

/**
 * Whether this page was opened by a link that promised a game which cannot
 * touch a rating (`?casual=1`).
 *
 * The tour's last step offers "Practice vs the bot" at a "Relaxed" strength,
 * and the first-run picker offers a first game. Neither carried a rated choice,
 * so both inherited the one remembered from the player's last game — and a
 * signed-in player who last played rated got a *rated* game out of a screen
 * that said practice. Measured on a device: the tour cost 31 rating points.
 *
 * The flag is deliberately not written to the remembered setup. It describes
 * this one game, arriving from this one link; the player's own choice is still
 * theirs the next time they open the form, and touching the switch here hands
 * control straight back (`release`).
 */
export function useCasualLink(): { casual: boolean; release: () => void } {
  const [casual, setCasual] = useState(false);

  // Read after paint rather than during render: the form is prerendered, and
  // the server has no query string to agree with.
  useIsomorphicLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).get('casual') === '1') setCasual(true);
  }, []);

  return { casual, release: () => setCasual(false) };
}
