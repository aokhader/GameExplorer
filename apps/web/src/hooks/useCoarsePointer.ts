'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * Is the primary pointer a finger? True on a phone or tablet browser, false
 * with a mouse or trackpad — and false during server rendering, where the
 * mouse-first layout is the safer guess because it asks for less.
 *
 * For choices a finger changes, not for styling: a board that must confirm a
 * placement a fingertip cannot hit accurately (Go above 9×9) reads this. CSS
 * should use `@media (pointer: coarse)` directly.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
