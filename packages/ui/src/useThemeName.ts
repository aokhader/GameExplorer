'use client';

/**
 * The React half of the theme runtime, kept apart from `themeRuntime.ts` so that
 * module stays importable from a React Server Component. `COLORS` and the other
 * live views are read by web server components, and a `useSyncExternalStore`
 * import anywhere in their module graph is a build error without this boundary.
 *
 * Only mobile calls this — web themes through CSS and never re-renders for it.
 */
import { useSyncExternalStore } from 'react';

import { getActiveTheme, subscribeTheme, type ThemeName } from './themeRuntime';

/**
 * Subscribe a component to theme changes. It returns the active theme name, but
 * the point is usually the re-render: call it in any component that paints with
 * `COLORS` / `GAME_ACCENTS` / the board and piece tokens, so it repaints when the
 * theme switches. Components that already consume a context which changes on a
 * switch (mobile's `useSettings`) get that for free and don't need this.
 */
export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribeTheme, getActiveTheme, getActiveTheme);
}
