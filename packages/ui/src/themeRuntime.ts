/**
 * Runtime theme switching for React Native.
 *
 * Web themes with CSS: one `[data-theme]` block of `--c-*` overrides and the
 * whole app follows, because every value is resolved by the browser at paint.
 * React Native has no cascade — a color is a plain string baked into a style
 * object — so the same trick needs a different mechanism.
 *
 * The approach here: every exported token object is a **live view**. Its keys are
 * getters that read from whichever theme is currently active, so an existing
 * `COLORS.surface` read returns the active theme's value with no call-site
 * change. Mobile reads all of these inside render (verified: no module-scope
 * capture, no destructuring), so a re-render is all that's needed to repaint.
 *
 * `useThemeName()` supplies that re-render. A component that paints with these
 * tokens subscribes once and re-renders when the theme changes.
 *
 * Web is unaffected: it never calls `setActiveTheme`, so every live view stays
 * pinned to `dark` and the module-scope reads web does (board tokens embedded as
 * CSS-variable fallbacks) keep resolving to the Arcade Glow literals.
 */

export type ThemeName = 'dark' | 'cozy';

let activeTheme: ThemeName = 'dark';
const listeners = new Set<() => void>();

/** The active theme. Read this when you need the name rather than a token. */
export function getActiveTheme(): ThemeName {
  return activeTheme;
}

/**
 * Switch themes. Every live view starts returning the new theme's values
 * immediately; subscribed components re-render on the next tick.
 */
export function setActiveTheme(name: ThemeName): void {
  if (name === activeTheme) return;
  activeTheme = name;
  for (const listener of listeners) listener();
}

/**
 * Subscribe to theme changes. Deliberately plain — this module stays free of any
 * React import so it can be pulled into a React Server Component. The `useThemeName`
 * hook that wraps this lives in its own `'use client'` module.
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Widen literal types to their base types, recursively.
 *
 * Token blocks are written `as const` so a typo in a key is caught, which also
 * pins every value to a literal type (`"#445576"`, not `string`). Two themes then
 * have mutually incompatible types. Widening lets both blocks satisfy one shape
 * and gives consumers a plain `string` rather than one theme's literal.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : // Tuples keep their arity — expo-linear-gradient's `colors` requires a
        // two-or-more tuple, so flattening these to `string[]` breaks the call.
        // `readonly` is preserved too: every token block is written `as const`,
        // and stripping it would make those blocks unassignable to the result.
        T extends readonly [unknown, ...unknown[]]
        ? { [K in keyof T]: Widen<T[K]> }
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : { [K in keyof T]: Widen<T[K]> };

/**
 * Build a live view over per-theme value sets: `liveView({ dark: A, cozy: B })`
 * returns an object with A's keys, each a getter reading the active theme's set.
 *
 * The result is typed as the plain token shape, so nothing about theming leaks
 * into the call sites that read it.
 */
export function liveView<T extends object>(byTheme: { dark: T; cozy: Widen<T> }): Widen<T> {
  const view = {} as Widen<T>;
  for (const key of Object.keys(byTheme.dark)) {
    Object.defineProperty(view, key, {
      get: () => (byTheme[activeTheme] as Record<string, unknown>)[key],
      enumerable: true,
    });
  }
  return view;
}
