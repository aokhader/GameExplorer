'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind's `lg` — where the game shells put the board and sidebar side by side. */
const QUERY = '(min-width: 64rem)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * Is the game shell side by side (`lg` and up), or one column? For choices that
 * move an element rather than restyle it — the action row sits under the board
 * on a phone and at the foot of the sidebar on a desktop, and rendering it
 * twice with one copy hidden would give it two sets of confirm-in-place state.
 * Styling should use the `lg:` variants directly.
 *
 * True during server rendering: the desktop arrangement is the one a shell with
 * nothing live yet has always drawn.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
