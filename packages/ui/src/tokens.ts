/**
 * Semantic app-level design tokens shared by web and mobile.
 *
 * This is the CANONICAL source of GameExplorer's visual identity — steel-blue +
 * gold on a dark slate base. Both platforms read these values:
 *   - mobile (React Native) imports the JS constants directly;
 *   - web mirrors them as CSS custom properties in `globals.css` (`@theme` +
 *     `--c-*` variables), so a key here and a `--c-*` var there are a PAIR.
 *     If you change a value, change both.
 *
 * Theming is architected for a future light mode: `THEMES` holds one block per
 * theme keyed identically; only `dark` is active today. Adding light later =
 * fill a `light` block + define `[data-theme="light"]` on web — no consumer
 * churn, because every consumer reads semantic names, not raw hex.
 */

/** Raw palette primitives. Reference these from theme blocks, not from UI code. */
const PALETTE = {
  // Slate base (page + panel surfaces)
  slate950: '#0b1120',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate750: '#283548',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate100: '#f1f5f9',
  // Gold (brand accent / primary action)
  gold:       '#cda43f',
  goldLight:  '#dcb456',
  goldDark:   '#b8923a',
  goldInk:    '#1a1206', // text/icon on a gold fill (AA on #cda43f)
  // Steel-blue (secondary / informational, the board's dark square)
  steel:      '#6f88a8',
  steelLight: '#87a0bf',
  // Status
  red600:   '#dc2626',
  red500:   '#ef4444',
  amber600: '#d97706',
  amber500: '#f59e0b',
  green600: '#16a34a',
  green500: '#22c55e',
  white:    '#ffffff',
} as const;

/** Shape of a complete theme — every theme must define all of these keys. */
export interface Theme {
  // Surfaces
  surface: string;       // page background
  surfaceAlt: string;    // cards / panels
  surfaceMuted: string;  // inputs / subtle fills
  surfaceHover: string;  // hover state for interactive surfaces
  border: string;        // default hairline border
  borderStrong: string;  // emphasized border / divider
  // Brand accent (gold) — primary action
  accent: string;
  accentHover: string;
  accentMuted: string;   // translucent gold for tonal fills / rings-at-rest
  onAccent: string;      // text/icon color on an accent fill
  // Steel-blue — secondary / info
  info: string;
  infoHover: string;
  infoMuted: string;
  // Status
  danger: string;
  dangerHover: string;
  dangerMuted: string;
  warning: string;
  warningHover: string;
  success: string;
  successHover: string;
  // Text
  fg: string;            // primary text
  fgMuted: string;       // secondary text
  fgSubtle: string;      // tertiary / placeholder
  fgInverse: string;     // text on a light surface
  // Focus
  focusRing: string;
}

/** Active dark theme (steel-blue + gold). */
const DARK: Theme = {
  surface:      PALETTE.slate900,
  surfaceAlt:   PALETTE.slate800,
  surfaceMuted: PALETTE.slate700,
  surfaceHover: PALETTE.slate750,
  border:       PALETTE.slate700,
  borderStrong: PALETTE.slate600,

  accent:       PALETTE.gold,
  accentHover:  PALETTE.goldLight,
  accentMuted:  'rgba(205,164,63,0.15)',
  onAccent:     PALETTE.goldInk,

  info:         PALETTE.steel,
  infoHover:    PALETTE.steelLight,
  infoMuted:    'rgba(111,136,168,0.18)',

  danger:       PALETTE.red600,
  dangerHover:  PALETTE.red500,
  dangerMuted:  'rgba(220,38,38,0.15)',
  warning:      PALETTE.amber600,
  warningHover: PALETTE.amber500,
  success:      PALETTE.green600,
  successHover: PALETTE.green500,

  fg:           PALETTE.slate100,
  fgMuted:      PALETTE.slate400,
  fgSubtle:     PALETTE.slate500,
  fgInverse:    PALETTE.slate900,

  focusRing:    PALETTE.gold,
};

/**
 * All themes, keyed by name. Only `dark` exists today; add `light` here with the
 * same keys when the toggle ships — see the file header.
 */
export const THEMES = {
  dark: DARK,
} as const;

export type ThemeName = keyof typeof THEMES;

/** The active semantic palette. UI code imports this. */
export const COLORS: Theme = THEMES.dark;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
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

export const FONT_WEIGHTS = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const SHADOWS = {
  sm: '0 1px 2px 0 rgba(0,0,0,0.30)',
  md: '0 4px 12px -2px rgba(0,0,0,0.40)',
  lg: '0 12px 28px -6px rgba(0,0,0,0.50)',
  xl: '0 25px 50px -12px rgba(0,0,0,0.55)',
} as const;

export const Z_INDEX = {
  base: 0,
  dropdown: 30,
  sticky: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
} as const;
