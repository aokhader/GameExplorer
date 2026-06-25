/**
 * Semantic app-level design tokens shared by web and mobile.
 *
 * These capture GameExplorer's current dark slate + green chrome as raw values
 * so both platforms read one source of truth instead of hardcoding Tailwind
 * classes (web) and StyleSheet literals (mobile) independently.
 *
 * Values intentionally mirror the Tailwind palette the web app already uses, so
 * adopting them on the web is a gradual, no-visual-change migration.
 */

export const COLORS = {
  surface:      '#0f172a', // page background      (slate-900)
  surfaceAlt:   '#1e293b', // cards / panels       (slate-800)
  surfaceMuted: '#334155', // inputs / subtle fills(slate-700)
  border:       '#334155', // (slate-700)
  accent:       '#16a34a', // primary action       (green-600)
  accentHover:  '#22c55e', // primary hover        (green-500)
  danger:       '#991b1b', // destructive          (red-800)
  warning:      '#b45309', // abort / caution      (amber-700)
  textPrimary:  '#ffffff',
  textMuted:    '#94a3b8', // (slate-400)
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

export const RADIUS = {
  sm: 6,    // rounded-md
  md: 8,    // rounded-lg
  lg: 12,   // rounded-xl
  xl: 16,   // rounded-2xl
  full: 9999,
} as const;

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '5xl': 48,
} as const;
