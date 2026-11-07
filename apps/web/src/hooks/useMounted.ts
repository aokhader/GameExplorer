'use client';

import { useEffect, useState } from 'react';

/**
 * False for the server render and the first client render, true from the
 * first commit on. For portals into `document.body` and other client-only
 * output: the first client render has to match the server's, which had no
 * `document`, or hydration fails.
 *
 * One hook instead of a `setMounted(true)` effect in each component, so the
 * render it costs is spent, and exempted from `set-state-in-effect`, once.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the extra render is the point: it is the first one allowed to differ from the server's
  useEffect(() => setMounted(true), []);
  return mounted;
}
