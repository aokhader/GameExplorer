import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * Plain `useLayoutEffect` logs a warning when a component is prerendered
 * (SSG/SSR), because layout effects never run on the server. This picks the
 * layout variant only in the browser, so we get its "commit before the browser
 * paints" timing — which lets us apply a state change (e.g. skipping the setup
 * screen for an onboarding deep link) without the intermediate state ever
 * painting — while staying quiet during `next build`.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
