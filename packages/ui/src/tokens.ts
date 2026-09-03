/**
 * Semantic app-level design tokens shared by web and mobile.
 *
 * This is the CANONICAL source of Finesse's visual identity — the "Arcade
 * Glow" system: a near-black arcade base with gold as the shared action color,
 * neon per-game accents (chess blue, checkers pink, reversi lime), and strong
 * glow/motion cues. Both platforms read these values:
 *   - mobile (React Native) imports the JS constants directly;
 *   - web mirrors them as CSS custom properties in `globals.css` (`@theme` +
 *     `--c-*` variables), so a key here and a `--c-*` var there are a PAIR.
 *     If you change a value, change both.
 *
 * Theming: `THEMES` holds one block per theme, keyed identically. `dark` (Arcade
 * Glow) is the default; `cozy` (Cozy Tabletop — warm parchment + walnut + felt
 * green) is user-selectable on both platforms. Consumers read semantic names, not
 * raw hex, so a new theme is a new block here + a new block there.
 *
 * The two platforms switch themes by different mechanisms:
 *   - web overrides the same `--c-*` vars under `[data-theme="cozy"]` and never
 *     touches the runtime, so every export below stays pinned to `dark`;
 *   - mobile has no cascade, so `COLORS` and friends are LIVE VIEWS whose keys
 *     read from the active theme (see `themeRuntime.ts`).
 * Either way a call site just reads `COLORS.surface` and gets the right value.
 */

import { liveView } from './themeRuntime';

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
  cyan:      '#22d3ee', // go — the one hue left between chess's blue and reversi's lime
  cyanLight: '#67e8f9',
  // Status
  rose600:  '#f43f5e', // danger — arcade rose
  rose500:  '#fb7185',
  amber600: '#d97706',
  amber500: '#f59e0b',
  emerald600: '#10b981', // success — neon teal-green ("live" pulse)
  emerald500: '#22d3aa',
  white:    '#ffffff',
} as const;

/**
 * Cozy Tabletop primitives — warm wood and felt, "a real board on the kitchen
 * table". A parchment/cream ramp for surfaces, walnut for chrome and the chess
 * signature, forest green as the action color, brass as the highlight.
 */
const COZY_PALETTE = {
  // Parchment ramp — page + panel surfaces (light).
  parchment50:  '#faf4e8', // cards / raised panels
  parchment100: '#f4ecd9', // hover surface
  parchment200: '#efe6d3', // page background
  parchment300: '#e6dcc4', // muted fills / inputs
  parchment400: '#e2d3b6', // hairline border
  parchment500: '#cdbb98', // strong border / divider
  // Ink ramp — text on parchment. The secondary and tertiary steps run darker
  // than the design doc's (#6f6350 / #9c8f79): those sat at 4.3:1 and 2.5:1 on
  // the tinted surfaces they land on, where the Arcade equivalents clear it.
  bark900: '#2c2117', // primary text
  bark700: '#3b2e21', // body text / reversi signature (slate-dark wood)
  bark500: '#5e5341', // secondary text
  bark400: '#857761', // tertiary / placeholder
  // Deep teal (go signature) — cool enough to separate from walnut and forest,
  // dark enough to carry small text on parchment.
  pine:      '#2c6360',
  pineLight: '#3d817d',
  // Walnut (chess signature + secondary/info chrome).
  walnut:      '#8b5a2b',
  walnutLight: '#a9743f',
  walnutDeep:  '#6e4a2a',
  // Forest green (primary action + checkers signature + success).
  forest:      '#2f6e4e',
  forestLight: '#3f8a63',
  forestDeep:  '#275c41', // hover — light themes darken rather than lighten
  forestInk:   '#f4ecd9', // text/icon on a forest fill
  // Brass (highlight / warning) — deepened so it survives as small text on cream.
  brass:      '#8a661d',
  brassLight: '#c9a24a',
  brassDeep:  '#6f5115',
  // Terracotta (danger) + a lighter clay for liquidate.
  clay:      '#a2482e',
  clayLight: '#c0685a',
  clayDeep:  '#85391f',
  claySoft:  '#b8724a',
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
 * Cozy Tabletop — the warm light theme (design doc `Cozy Tabletop.dc.html`).
 *
 * Inverts Arcade Glow's relationship to light: parchment surfaces, walnut chrome,
 * and forest green as the single action color, with brass reserved for highlights.
 * The accent is green rather than gold because on a cream page gold has too little
 * contrast to carry a primary button.
 */
const COZY: Theme = {
  surface:      COZY_PALETTE.parchment200,
  surfaceAlt:   COZY_PALETTE.parchment50,
  surfaceMuted: COZY_PALETTE.parchment300,
  surfaceHover: COZY_PALETTE.parchment100,
  border:       COZY_PALETTE.parchment400,
  borderStrong: COZY_PALETTE.parchment500,

  // Hover goes DARKER here, the opposite of Arcade Glow: on a dark theme
  // "brighter" reads as raised, on parchment it reads as receding — and these
  // hues double as text colors, where lightening drops them under AA.
  accent:       COZY_PALETTE.forest,
  accentHover:  COZY_PALETTE.forestDeep,
  accentMuted:  'rgba(47,110,78,0.14)',
  onAccent:     COZY_PALETTE.forestInk,

  info:         COZY_PALETTE.walnut,
  infoHover:    COZY_PALETTE.walnutDeep,
  infoMuted:    'rgba(139,90,43,0.12)',

  danger:       COZY_PALETTE.clay,
  dangerHover:  COZY_PALETTE.clayDeep,
  dangerMuted:  'rgba(162,72,46,0.12)',
  // Deeper than the design's brass #c9a24a: warning is only ever small text on a
  // warning tint, and brass-on-cream is 2.2:1.
  warning:      COZY_PALETTE.brass,
  warningHover: COZY_PALETTE.brassDeep,
  success:      COZY_PALETTE.forest,
  successHover: COZY_PALETTE.forestDeep,

  fg:           COZY_PALETTE.bark900,
  fgMuted:      COZY_PALETTE.bark500,
  fgSubtle:     COZY_PALETTE.bark400,
  // The theme is light, so "text on the opposite surface" is the cream tone.
  fgInverse:    COZY_PALETTE.parchment50,

  focusRing:    COZY_PALETTE.forest,
};

/**
 * All themes, keyed by name. `dark` is the default; `cozy` is user-selectable on
 * both platforms. Adding another = a block here, a matching `[data-theme="…"]`
 * block in `apps/web/src/app/globals.css`, and an entry in every `liveView` below.
 */
export const THEMES = {
  dark: DARK,
  cozy: COZY,
} as const;

/**
 * The active semantic palette — a LIVE view (see `themeRuntime.ts`). On mobile
 * `COLORS.surface` returns whichever theme is active; on web it stays `dark`,
 * because web themes through CSS variables and never calls `setActiveTheme`.
 */
export const COLORS: Theme = liveView({ dark: DARK, cozy: COZY });

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

const DARK_GAME_ACCENTS: Record<'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate', GameAccent> = {
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
  go: {
    base: PALETTE.cyan, glow: 'rgba(34,211,238,0.42)', light: PALETTE.cyanLight,
    tintBg: 'rgba(34,211,238,0.15)', tintBgSoft: 'rgba(34,211,238,0.03)', tintBorder: 'rgba(34,211,238,0.38)',
  },
  liquidate: {
    base: PALETTE.violet, glow: 'rgba(139,92,246,0.45)', light: PALETTE.violetLight,
    tintBg: 'rgba(139,92,246,0.16)', tintBgSoft: 'rgba(139,92,246,0.03)', tintBorder: 'rgba(139,92,246,0.40)',
  },
} as const;

/**
 * Cozy Tabletop per-game hues — "walnut for chess, forest green for checkers,
 * slate for reversi" (design doc intro), plus clay for liquidate. Glows are far
 * weaker than Arcade Glow's: on a cream page a neon bloom reads as a smudge, so
 * these are tints that warm the surface rather than halos that radiate off it.
 */
export const COZY_GAME_ACCENTS: Record<keyof typeof DARK_GAME_ACCENTS, GameAccent> = {
  chess: {
    base: COZY_PALETTE.walnut, glow: 'rgba(169,116,63,0.30)', light: COZY_PALETTE.walnutLight,
    tintBg: 'rgba(139,90,43,0.10)', tintBgSoft: 'rgba(139,90,43,0.02)', tintBorder: 'rgba(169,116,63,0.45)',
  },
  checkers: {
    base: COZY_PALETTE.forest, glow: 'rgba(47,110,78,0.24)', light: COZY_PALETTE.forestLight,
    tintBg: 'rgba(47,110,78,0.10)', tintBgSoft: 'rgba(47,110,78,0.02)', tintBorder: 'rgba(47,110,78,0.42)',
  },
  reversi: {
    base: COZY_PALETTE.bark700, glow: 'rgba(59,46,33,0.22)', light: COZY_PALETTE.bark500,
    tintBg: 'rgba(59,46,33,0.09)', tintBgSoft: 'rgba(59,46,33,0.02)', tintBorder: 'rgba(59,46,33,0.38)',
  },
  go: {
    base: COZY_PALETTE.pine, glow: 'rgba(44,99,96,0.24)', light: COZY_PALETTE.pineLight,
    tintBg: 'rgba(44,99,96,0.10)', tintBgSoft: 'rgba(44,99,96,0.02)', tintBorder: 'rgba(44,99,96,0.42)',
  },
  liquidate: {
    base: COZY_PALETTE.claySoft, glow: 'rgba(184,114,74,0.26)', light: COZY_PALETTE.clayLight,
    tintBg: 'rgba(184,114,74,0.11)', tintBgSoft: 'rgba(184,114,74,0.02)', tintBorder: 'rgba(184,114,74,0.42)',
  },
} as const;

/** Active per-game accents — live view (see `COLORS` above). */
export const GAME_ACCENTS: Record<'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate', GameAccent> =
  liveView({ dark: DARK_GAME_ACCENTS, cozy: COZY_GAME_ACCENTS });

export type { ThemeName } from './themeRuntime';

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
  glowGo:       '0 0 0 1px rgba(34,211,238,0.32), 0 0 40px -8px rgba(34,211,238,0.55)',
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

const DARK_SHADOWS_NATIVE = {
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
  glowGo:       { shadowColor: PALETTE.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 12 },
  glowLiquidate:{ shadowColor: PALETTE.violet, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 20, elevation: 12 },
} as const satisfies Record<keyof typeof SHADOWS, NativeShadow>;

/**
 * Cozy Tabletop's native shadows. Two differences from Arcade Glow, both because
 * the surface underneath is light: the drop shadows are warm brown at much lower
 * opacity (pure black on cream reads as grime), and the "glows" become ordinary
 * downward shadows — an evenly-radiating colored halo needs a dark backdrop to
 * bloom against, and on parchment just looks like a printing misregistration.
 */
const COZY_SHADOW = '#5a3a1c';
const COZY_SHADOWS_NATIVE = {
  sm: { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 6, elevation: 4 },
  lg: { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 8 },
  xl: { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 25, elevation: 12 },
  elevation:   { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 15, elevation: 8 },
  elevationLg: { shadowColor: COZY_SHADOW, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.24, shadowRadius: 30, elevation: 14 },
  glowAccent:   { shadowColor: COZY_PALETTE.forest,  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  glowInfo:     { shadowColor: COZY_PALETTE.walnut,  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 12, elevation: 8 },
  glowChess:    { shadowColor: COZY_PALETTE.walnut,  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10 },
  glowCheckers: { shadowColor: COZY_PALETTE.forest,  shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10 },
  glowReversi:  { shadowColor: COZY_PALETTE.bark700, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 14, elevation: 10 },
  glowGo:       { shadowColor: COZY_PALETTE.pine,    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 14, elevation: 10 },
  glowLiquidate:{ shadowColor: COZY_PALETTE.claySoft,shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10 },
} as const satisfies Record<keyof typeof SHADOWS, NativeShadow>;

export const SHADOWS_NATIVE: Record<keyof typeof SHADOWS, NativeShadow> =
  liveView({ dark: DARK_SHADOWS_NATIVE, cozy: COZY_SHADOWS_NATIVE });

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
const DARK_GLOWS_NATIVE = {
  glowAccent:   '0 0 34px -4px rgba(205,164,63,0.65)',
  glowInfo:     '0 0 32px -4px rgba(59,130,246,0.55)',
  glowChess:    '0 0 40px -8px rgba(59,130,246,0.65)',
  glowCheckers: '0 0 40px -8px rgba(236,72,153,0.65)',
  glowReversi:  '0 0 40px -8px rgba(163,230,53,0.55)',
  glowGo:       '0 0 40px -8px rgba(34,211,238,0.55)',
  glowLiquidate:'0 0 40px -8px rgba(139,92,246,0.65)',
} as const;

/** Cozy: warm downward shadows rather than halos — see COZY_SHADOWS_NATIVE. */
const COZY_GLOWS_NATIVE = {
  glowAccent:   '0 8px 20px -10px rgba(47,110,78,0.55)',
  glowInfo:     '0 8px 20px -10px rgba(139,90,43,0.50)',
  glowChess:    '0 8px 22px -10px rgba(124,82,48,0.55)',
  glowCheckers: '0 8px 22px -10px rgba(47,110,78,0.55)',
  glowReversi:  '0 8px 22px -10px rgba(59,46,33,0.45)',
  glowGo:       '0 8px 22px -10px rgba(44,99,96,0.45)',
  glowLiquidate:'0 8px 22px -10px rgba(184,114,74,0.55)',
} as const;

export const GLOWS_NATIVE: Record<keyof typeof DARK_GLOWS_NATIVE, string> =
  liveView({ dark: DARK_GLOWS_NATIVE, cozy: COZY_GLOWS_NATIVE });

/**
 * React Native gradient equivalents of `GRADIENTS`, parsed into the shape
 * `expo-linear-gradient` / `react-native-linear-gradient` consume: a `colors`
 * array with matching `locations` (0–1) and `start`/`end` unit points. Angles are
 * converted to points — 180deg = top→bottom (0.5,0)→(0.5,1); 135deg = top-left→
 * bottom-right (0,0)→(1,1).
 */
export interface NativeGradient {
  colors: readonly string[];
  locations: readonly number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const VERTICAL = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } } as const;
const DIAGONAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;

const DARK_GRADIENTS_NATIVE = {
  accent:  { colors: ['#dcb456', '#cda43f', '#b8923a'], locations: [0, 0.55, 1], ...VERTICAL },
  surface: { colors: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'], locations: [0, 0.4], ...VERTICAL },
  heroChess:    { colors: ['#3b82f6', '#ec4899'], locations: [0, 1], ...DIAGONAL },
  heroCheckers: { colors: ['#ec4899', '#cda43f'], locations: [0, 1], ...DIAGONAL },
  heroReversi:  { colors: ['#a3e635', '#22d3aa'], locations: [0, 1], ...DIAGONAL },
  heroLiquidate:{ colors: ['#8b5cf6', '#38bdf8'], locations: [0, 1], ...DIAGONAL },
  heroBrand:    { colors: ['#3b82f6', '#ec4899'], locations: [0, 1], ...DIAGONAL },
} as const satisfies Record<keyof typeof GRADIENTS, NativeGradient>;

/**
 * Cozy gradients. The `surface` sheen flips sign — on a light card the lift comes
 * from white at the top fading to a faint warm shade, not a white wash — and the
 * hero pairs walk the wood-and-felt range instead of two neons.
 */
const COZY_GRADIENTS_NATIVE = {
  accent:  { colors: ['#337157', '#2f6e4e', '#275c41'], locations: [0, 0.55, 1], ...VERTICAL },
  surface: { colors: ['rgba(255,255,255,0.55)', 'rgba(139,90,43,0.03)'], locations: [0, 1], ...VERTICAL },
  heroChess:    { colors: ['#a9743f', '#6e4a2a'], locations: [0, 1], ...DIAGONAL },
  heroCheckers: { colors: ['#3f8a63', '#23503a'], locations: [0, 1], ...DIAGONAL },
  heroReversi:  { colors: ['#6f6350', '#3b2e21'], locations: [0, 1], ...DIAGONAL },
  heroLiquidate:{ colors: ['#c0685a', '#7c2d1e'], locations: [0, 1], ...DIAGONAL },
  heroBrand:    { colors: ['#a9743f', '#2f6e4e'], locations: [0, 1], ...DIAGONAL },
} as const satisfies Record<keyof typeof GRADIENTS, NativeGradient>;

export const GRADIENTS_NATIVE =
  liveView({ dark: DARK_GRADIENTS_NATIVE, cozy: COZY_GRADIENTS_NATIVE });

export const Z_INDEX = {
  base: 0,
  dropdown: 30,
  sticky: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
} as const;
