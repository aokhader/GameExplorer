/**
 * Semantic app-level design tokens shared by web and mobile.
 *
 * This is the CANONICAL source of GameExplorer's visual identity — the "Arcade
 * Glow" system: a near-black arcade base with gold as the shared action color,
 * neon per-game accents (chess blue, checkers pink, reversi lime), and strong
 * glow/motion cues. Both platforms read these values:
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
  // Arcade base — a near-black blue-slate ramp (page + panel surfaces + chrome).
  ink950:  '#07090f', // deepest page void (radial-gradient base)
  ink900:  '#0b0e17', // page background
  ink850:  '#111726', // raised panels / browser chrome
  ink800:  '#141b2d', // cards / panels
  ink750:  '#1a2338', // hover surface
  ink700:  '#212b45', // muted fills / inputs
  ink600:  '#2b3652', // strong border / divider
  ink500:  '#5c6a85', // subtle text / disabled
  slate400: '#9aa6bd', // secondary text
  slate100: '#e7ecf6', // primary text
  // Gold (brand accent / primary action) — unchanged, the shared CTA color.
  gold:       '#cda43f',
  goldLight:  '#dcb456',
  goldDark:   '#b8923a',
  goldInk:    '#1a1206', // text/icon on a gold fill (AA on #cda43f)
  // Neon blue (secondary / informational, chess signature) — the arcade upgrade
  // of the old steel. Bright electric blue with a lighter hover.
  blue:      '#3b82f6',
  blueLight: '#7db1ff',
  // Per-game signature hues — saturated neon that glows on the near-black base.
  pink:      '#ec4899', // checkers — hot magenta
  pinkLight: '#ff8fc4',
  lime:      '#a3e635', // reversi — acid lime
  limeLight: '#bef264',
  violet:      '#8b5cf6', // liquidate — nebula violet
  violetLight: '#c4b5fd',
  // Status
  rose600:  '#f43f5e', // danger — arcade rose
  rose500:  '#fb7185',
  amber600: '#d97706',
  amber500: '#f59e0b',
  emerald600: '#10b981', // success — neon teal-green ("live" pulse)
  emerald500: '#22d3aa',
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

/** Active dark theme (Arcade Glow — neon on near-black + gold action). */
const DARK: Theme = {
  surface:      PALETTE.ink900,
  surfaceAlt:   PALETTE.ink800,
  surfaceMuted: PALETTE.ink700,
  surfaceHover: PALETTE.ink750,
  border:       PALETTE.ink700,
  borderStrong: PALETTE.ink600,

  accent:       PALETTE.gold,
  accentHover:  PALETTE.goldLight,
  accentMuted:  'rgba(205,164,63,0.15)',
  onAccent:     PALETTE.goldInk,

  info:         PALETTE.blue,
  infoHover:    PALETTE.blueLight,
  infoMuted:    'rgba(59,130,246,0.16)',

  danger:       PALETTE.rose600,
  dangerHover:  PALETTE.rose500,
  dangerMuted:  'rgba(244,63,94,0.14)',
  warning:      PALETTE.amber600,
  warningHover: PALETTE.amber500,
  success:      PALETTE.emerald600,
  successHover: PALETTE.emerald500,

  fg:           PALETTE.slate100,
  fgMuted:      PALETTE.slate400,
  fgSubtle:     PALETTE.ink500,
  fgInverse:    PALETTE.ink900,

  focusRing:    PALETTE.gold,
};

/**
 * All themes, keyed by name. Only `dark` exists today; add `light` here with the
 * same keys when the toggle ships — see the file header.
 */
export const THEMES = {
  dark: DARK,
} as const;

/**
 * Per-game signature accent — a base hue + a translucent glow used for ambient
 * blooms, hovered cards, and hero gradients. Gold stays the shared brand/CTA;
 * these add per-game identity. Chess shares the neon-blue `info` hue. Mirrored
 * on web as `--c-game-*` / `--c-game-*-glow`.
 */
export interface GameAccent {
  base: string;
  glow: string; // translucent, for radial blooms / glow rings
  /** Lightened hue — text/chevrons sitting on dark tinted fills. */
  light: string;
  /** Translucent tint fill (~16%) — card/icon-tile backgrounds. */
  tintBg: string;
  /** Near-transparent tail (~3%) — the fade end of tinted card gradients. */
  tintBgSoft: string;
  /** Translucent border (~40%) — hairline on tinted cards/tiles. */
  tintBorder: string;
}

export const GAME_ACCENTS: Record<'chess' | 'checkers' | 'reversi' | 'liquidate', GameAccent> = {
  // The tint ramp (bg/bgSoft/border) powers the Arcade Glow card treatment on
  // mobile home/hub screens; web mirrors as `--c-game-*-tint*` vars if adopted.
  chess: {
    base: PALETTE.blue, glow: 'rgba(59,130,246,0.45)', light: PALETTE.blueLight,
    tintBg: 'rgba(59,130,246,0.16)', tintBgSoft: 'rgba(59,130,246,0.03)', tintBorder: 'rgba(59,130,246,0.40)',
  },
  checkers: {
    base: PALETTE.pink, glow: 'rgba(236,72,153,0.45)', light: PALETTE.pinkLight,
    tintBg: 'rgba(236,72,153,0.16)', tintBgSoft: 'rgba(236,72,153,0.03)', tintBorder: 'rgba(236,72,153,0.40)',
  },
  reversi: {
    base: PALETTE.lime, glow: 'rgba(163,230,53,0.42)', light: PALETTE.limeLight,
    tintBg: 'rgba(163,230,53,0.15)', tintBgSoft: 'rgba(163,230,53,0.03)', tintBorder: 'rgba(163,230,53,0.38)',
  },
  liquidate: {
    base: PALETTE.violet, glow: 'rgba(139,92,246,0.45)', light: PALETTE.violetLight,
    tintBg: 'rgba(139,92,246,0.16)', tintBgSoft: 'rgba(139,92,246,0.03)', tintBorder: 'rgba(139,92,246,0.40)',
  },
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
  // Elevation: layered depth + a 1px top-edge highlight (the Apple "lit from
  // above" surface). Inset highlight first, drop shadow after.
  elevation: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 10px 30px -10px rgba(0,0,0,0.55)',
  elevationLg: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 24px 60px -16px rgba(0,0,0,0.65)',
  // Glow: a colored neon halo for primary actions / focal elements at rest+hover.
  glowAccent:   '0 0 0 1px rgba(205,164,63,0.30), 0 0 34px -4px rgba(205,164,63,0.65)',
  glowInfo:     '0 0 0 1px rgba(59,130,246,0.30), 0 0 32px -4px rgba(59,130,246,0.55)',
  glowChess:    '0 0 0 1px rgba(59,130,246,0.35), 0 0 40px -8px rgba(59,130,246,0.65)',
  glowCheckers: '0 0 0 1px rgba(236,72,153,0.35), 0 0 40px -8px rgba(236,72,153,0.65)',
  glowReversi:  '0 0 0 1px rgba(163,230,53,0.32), 0 0 40px -8px rgba(163,230,53,0.55)',
  glowLiquidate:'0 0 0 1px rgba(139,92,246,0.35), 0 0 40px -8px rgba(139,92,246,0.65)',
} as const;

/**
 * Gradient strings (hero/per-game/surface sheen). Shared so RN can read the same
 * stops. Web also expresses these as `--gradient-*` vars in globals.css.
 */
export const GRADIENTS = {
  // Primary CTA fill — gold with a lit top edge.
  accent:  'linear-gradient(180deg, #dcb456 0%, #cda43f 55%, #b8923a 100%)',
  // Subtle top-lit panel sheen layered over surfaceAlt.
  surface: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 40%)',
  // Per-game hero washes (used at low opacity behind hero content).
  heroChess:    'linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)',
  heroCheckers: 'linear-gradient(135deg, #ec4899 0%, #cda43f 100%)',
  heroReversi:  'linear-gradient(135deg, #a3e635 0%, #22d3aa 100%)',
  heroLiquidate:'linear-gradient(135deg, #8b5cf6 0%, #38bdf8 100%)',
  heroBrand:    'linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)',
} as const;

/**
 * React Native shadow equivalents of `SHADOWS`. RN cannot consume CSS box-shadow
 * strings, so these carry the same visual intent as `{ shadowColor, shadowOffset,
 * shadowOpacity, shadowRadius }` (iOS) + `elevation` (Android). The colored `glow*`
 * variants approximate the web neon halo with a tinted shadow; components that want
 * the crisp 1px ring should pair this with a `borderColor`/`borderWidth`.
 */
export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const SHADOWS_NATIVE = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.55, shadowRadius: 25, elevation: 12 },
  // Elevation tokens: RN has no inset highlight; approximate the "lit from above"
  // depth with the drop-shadow half only. Pair with a top hairline border if needed.
  elevation:   { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 15, elevation: 8 },
  elevationLg: { shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.65, shadowRadius: 30, elevation: 14 },
  // Neon glows: tinted shadow, offset 0 (halo radiates evenly), high radius.
  glowAccent:   { shadowColor: PALETTE.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 17, elevation: 10 },
  glowInfo:     { shadowColor: PALETTE.blue, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 10 },
  glowChess:    { shadowColor: PALETTE.blue, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 20, elevation: 12 },
  glowCheckers: { shadowColor: PALETTE.pink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 20, elevation: 12 },
  glowReversi:  { shadowColor: PALETTE.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 12 },
  glowLiquidate:{ shadowColor: PALETTE.violet, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 20, elevation: 12 },
} as const satisfies Record<keyof typeof SHADOWS, NativeShadow>;

/**
 * Neon glows for React Native as `boxShadow` strings, carrying the same blur and
 * negative spread as their `SHADOWS` counterparts (RN 0.76+ honors both).
 *
 * Prefer these over `SHADOWS_NATIVE.glow*` on rounded and circular views. The
 * elevation-based tokens draw an Android shadow that follows the view's outline
 * at full strength, so a circle reads as a hard halo ring rather than a bloom;
 * the negative spread here pulls the falloff inward and it dissolves instead.
 * The elevation tokens stay for square board tiles, where the plate is the
 * intended shape, and for anything needing real Android z-ordering.
 *
 * The `0 0 0 1px` ring from `SHADOWS` is omitted — pair with a borderColor.
 */
export const GLOWS_NATIVE = {
  glowAccent:   '0 0 34px -4px rgba(205,164,63,0.65)',
  glowInfo:     '0 0 32px -4px rgba(59,130,246,0.55)',
  glowChess:    '0 0 40px -8px rgba(59,130,246,0.65)',
  glowCheckers: '0 0 40px -8px rgba(236,72,153,0.65)',
  glowReversi:  '0 0 40px -8px rgba(163,230,53,0.55)',
  glowLiquidate:'0 0 40px -8px rgba(139,92,246,0.65)',
} as const;

/**
 * React Native gradient equivalents of `GRADIENTS`, parsed into the shape
 * `expo-linear-gradient` / `react-native-linear-gradient` consume: a `colors`
 * array with matching `locations` (0–1) and `start`/`end` unit points. Angles are
 * converted to points — 180deg = top→bottom (0.5,0)→(0.5,1); 135deg = top-left→
 * bottom-right (0,0)→(1,1).
 */
export interface NativeGradient {
  colors: string[];
  locations: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const VERTICAL = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } } as const;
const DIAGONAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;

export const GRADIENTS_NATIVE = {
  accent:  { colors: ['#dcb456', '#cda43f', '#b8923a'], locations: [0, 0.55, 1], ...VERTICAL },
  surface: { colors: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'], locations: [0, 0.4], ...VERTICAL },
  heroChess:    { colors: ['#3b82f6', '#ec4899'], locations: [0, 1], ...DIAGONAL },
  heroCheckers: { colors: ['#ec4899', '#cda43f'], locations: [0, 1], ...DIAGONAL },
  heroReversi:  { colors: ['#a3e635', '#22d3aa'], locations: [0, 1], ...DIAGONAL },
  heroLiquidate:{ colors: ['#8b5cf6', '#38bdf8'], locations: [0, 1], ...DIAGONAL },
  heroBrand:    { colors: ['#3b82f6', '#ec4899'], locations: [0, 1], ...DIAGONAL },
} as const satisfies Record<keyof typeof GRADIENTS, NativeGradient>;

export const Z_INDEX = {
  base: 0,
  dropdown: 30,
  sticky: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
} as const;
