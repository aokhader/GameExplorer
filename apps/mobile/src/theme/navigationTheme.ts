/**
 * React Navigation's palette, fed from our own tokens.
 *
 * React Navigation carries a theme of its own, quite separate from `COLORS`,
 * and it paints with it. The one that matters is `colors.background`: expo-router
 * hands it to `ScreenStack` as `nativeContainerStyle`, and on iOS that becomes
 * the navigation controller's own view — the layer *behind* every screen in the
 * stack. While a screen slides in or out, UIKit masks the moving screens to the
 * display's corner radius, so for the length of the animation that layer shows
 * through the four rounded corners.
 *
 * Left alone it is `DefaultTheme`, whose background is `rgb(242, 242, 242)`.
 * Nothing in the app ever mounted a `ThemeProvider`, so every push and every
 * swipe-back flashed four near-white corners over a near-black app — and the
 * app's own `userInterfaceStyle: 'dark'` had no say in it, because React
 * Navigation only picks a theme when it is given one.
 *
 * The same value is also the default `contentStyle` / `sceneStyle` for any
 * navigator that does not set its own, so building this from the active theme
 * is what keeps a navigator added later from starting out light.
 */
import { DarkTheme, DefaultTheme } from 'expo-router';
import { COLORS, type ThemeName } from '@gameexplorer/ui';

type NavigationTheme = typeof DarkTheme;

/**
 * A React Navigation theme for the active app theme. `COLORS` is a live view,
 * so this must be rebuilt whenever the theme name changes — call it from a
 * `useMemo` keyed on `useThemeName()`.
 */
export function navigationTheme(name: ThemeName): NavigationTheme {
  // Cozy Tabletop is a light theme; the base decides `dark`, which React
  // Navigation passes on to native containers that ask the system for a look.
  const base = name === 'cozy' ? DefaultTheme : DarkTheme;

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: COLORS.accent,
      background: COLORS.surface,
      card: COLORS.surfaceAlt,
      text: COLORS.fg,
      border: COLORS.border,
      notification: COLORS.danger,
    },
  };
}
