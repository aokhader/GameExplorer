/**
 * Liquidate board + star-system tokens.
 *
 * Paired with the `--c-liquidate-*` / `--gx-liquidate-*` custom properties in the
 * web app's `globals.css` — change a value here and change it there (same
 * contract as the other games' board tokens).
 *
 * The eight system colours are an original ramp that walks the spectrum in price
 * order (cheap = hot, dear = gold), so a player can rank a system at a glance
 * without reading the price. They are knocked back from pure saturation because
 * the redesign puts a colour bar on every property tile: a full-strength ramp
 * turns the loop into a stripe of neon and stops the labels reading.
 */

import { liveView } from '../themeRuntime';

const DARK_LIQUIDATE_SYSTEM_COLORS = {
  ember:   '#ef5f6b',
  rust:    '#b07a4e',
  amber:   '#f0993a',
  verdant: '#8fd14f',
  azure:   '#4aa8e0',
  violet:  '#9b7be6',
  crimson: '#e2607f',
  aurum:   '#e6b24d',
} as const;

/** Tabletop: the same eight hues at printed-ink saturation. */
const COZY_LIQUIDATE_SYSTEM_COLORS = {
  ember:   '#c2564b',
  rust:    '#9c7247',
  amber:   '#d98b3f',
  verdant: '#7a9a44',
  azure:   '#6ba7b0',
  violet:  '#8f74b0',
  crimson: '#b4566b',
  aurum:   '#d69a3c',
} as const;

export const LIQUIDATE_SYSTEM_COLORS =
  liveView({ dark: DARK_LIQUIDATE_SYSTEM_COLORS, cozy: COZY_LIQUIDATE_SYSTEM_COLORS });

export type LiquidateSystemKey = keyof typeof DARK_LIQUIDATE_SYSTEM_COLORS;

/**
 * Board surfaces.
 *
 * Command Deck is near-black board art; Tabletop is a printed board on linen.
 * The tile fg pair therefore FLIPS with the theme — unlike chess or reversi,
 * whose boards stay dark in both — so anything drawn on a tile must read these
 * rather than the page's foreground.
 */
const DARK_LIQUIDATE_BOARD_COLORS = {
  /** The board's outer frame / gutter between tiles. */
  frame: '#0a0e18',
  /** A normal tile face. */
  tile: '#111a2b',
  /** Corner tiles, set apart from the edges. */
  corner: '#17223a',
  /** The open middle of the loop. */
  well: '#0a0e18',
  /** Hairline between tiles. */
  border: 'rgba(255,255,255,0.08)',
  /** Ring on the tile the active player occupies. */
  activeRing: '#e7b64e',
  /** Tint over a mortgaged holding. */
  mortgaged: 'rgba(244,63,94,0.22)',
  /** Text on a tile — tracks the BOARD's surface, not the page's. */
  tileFg: '#eef2f9',
  tileFgMuted: '#93a0b6',
} as const;

/** Tabletop: card stock on linen. The board is now the lightest surface. */
const COZY_LIQUIDATE_BOARD_COLORS = {
  frame: '#e9dfca',
  tile: '#fdf8ef',
  corner: '#f4ebd9',
  well: '#e9dfca',
  border: 'rgba(74,52,28,0.15)',
  activeRing: '#b5623a',
  mortgaged: 'rgba(154,77,44,0.20)',
  tileFg: '#382a1b',
  tileFgMuted: '#7d6c53',
} as const;

export const LIQUIDATE_BOARD_COLORS =
  liveView({ dark: DARK_LIQUIDATE_BOARD_COLORS, cozy: COZY_LIQUIDATE_BOARD_COLORS });

/**
 * Board chrome: the inspector, action dock, standings and log. These sit on the
 * board's own art rather than on the page surface, so they cannot reuse the page
 * tokens — the two surfaces move independently between themes.
 */
const DARK_LIQUIDATE_PANEL_COLORS = {
  panel: '#141c2c',
  panel2: '#0e1522',
  line: 'rgba(255,255,255,0.09)',
  ink: '#eef2f9',
  dim: '#93a0b6',
  soft: '#606d84',
  accent: '#e7b64e',
  accentInk: '#241a06',
  /** The seat this device is following — the "you" hue, distinct from accent. */
  you: '#59c1f0',
  track: 'rgba(255,255,255,0.09)',
  rowLine: 'rgba(255,255,255,0.08)',
  hint: 'rgba(231,182,78,0.10)',
  hintLine: 'rgba(231,182,78,0.32)',
  hintInk: '#f2cf82',
  /** Non-system ownables, which have no star system to take a hue from. */
  /** Debt, forced sales, and anything the player is about to lose. */
  danger: '#ef5f6b',
  gate: '#8b93a8',
  utility: '#6fc4b0',
} as const;

const COZY_LIQUIDATE_PANEL_COLORS = {
  panel: '#fdf8ef',
  panel2: '#f4ebd9',
  line: 'rgba(74,52,28,0.16)',
  ink: '#382a1b',
  dim: '#7d6c53',
  soft: '#a6957c',
  accent: '#b5623a',
  accentInk: '#fff6ec',
  you: '#3f7d78',
  track: 'rgba(74,52,28,0.12)',
  rowLine: 'rgba(74,52,28,0.10)',
  hint: 'rgba(181,98,58,0.12)',
  hintLine: 'rgba(181,98,58,0.30)',
  hintInk: '#9a4d2c',
  // Printed-ink red, not the Arcade neon: on parchment that reads as a glow
  // rather than a warning, and it has to stay distinct from the clay accent.
  danger: '#a63a33',
  gate: '#8a7a63',
  utility: '#7f9c6a',
} as const;

export const LIQUIDATE_PANEL_COLORS =
  liveView({ dark: DARK_LIQUIDATE_PANEL_COLORS, cozy: COZY_LIQUIDATE_PANEL_COLORS });

/**
 * Per-seat token colours, in seat order — up to six players.
 *
 * A plain array, deliberately NOT a `liveView`: that helper builds an object of
 * getters, which would lose `.length` and the array methods every call site uses
 * to wrap the seat index. Web themes these through `--gx-liquidate-seat-N`.
 */
export const LIQUIDATE_SEAT_COLORS = [
  '#59c1f0', // sky
  '#ef5f6b', // coral
  '#8fd14f', // lime
  '#e6b24d', // gold
  '#9b7be6', // orchid
  '#37c0a8', // teal
] as const;

export const COZY_LIQUIDATE_SEAT_COLORS = [
  '#3f7d78', // teal
  '#c2564b', // clay
  '#7a9a44', // moss
  '#d69a3c', // brass
  '#8f74b0', // plum
  '#6ba7b0', // slate blue
] as const;

/** Styling for the two event decks, so cards and tiles agree. */
export const LIQUIDATE_DECK_STYLE = {
  anomaly: { base: '#9b7be6', glyph: '✦' },
  federation: { base: '#59c1f0', glyph: '❖' },
} as const;

/**
 * The Liquidate identity mark — a ringed planet.
 *
 * This is the game's ICON, not a board piece: it stands in for Liquidate on
 * home tiles, hub heroes, tutorial headers and profile rows, the same job
 * `GoStone` does for Go. It exists because Liquidate was the one game with no
 * shared art, so each platform improvised — web drew the `🪐` emoji and mobile
 * reused `PlayerToken`, the on-board pawn. Neither is an identity mark.
 *
 * The ring is load-bearing, not decoration. This icon sits in a set beside
 * `GoStone` (a white circle) and `ReversiDisc` (a black one); without the ring
 * it would be a third circle and the row would read as three of the same game.
 *
 * Sphere takes the liquidate accent (violet on Arcade, clay on Tabletop) so it
 * matches the `--c-game-liquidate` card it usually sits on; the ring takes the
 * `aurum` system hue, which is the one colour in the Liquidate ramp that reads
 * against both a violet and a clay body.
 */
const DARK_LIQUIDATE_PLANET_STYLE = {
  body: [
    { offset: 0, color: '#c4b5fd' },
    { offset: 0.55, color: '#8b5cf6' },
    { offset: 1, color: '#4c2a9e' },
  ],
  border: 'rgba(255,255,255,0.18)',
  sheen: 'rgba(255,255,255,0.85)',
  /** The half of the ring passing in front of the sphere. */
  ring: '#e6b24d',
  /** The half passing behind — dimmer, so the crossing reads as depth. */
  ringBack: 'rgba(230,178,77,0.5)',
} as const;

const COZY_LIQUIDATE_PLANET_STYLE = {
  body: [
    { offset: 0, color: '#e3a98d' },
    { offset: 0.55, color: '#b8724a' },
    { offset: 1, color: '#7c3d20' },
  ],
  border: 'rgba(90,55,30,0.38)',
  sheen: 'rgba(255,255,255,0.78)',
  ring: '#d69a3c',
  ringBack: 'rgba(214,154,60,0.55)',
} as const;

export const LIQUIDATE_PLANET_STYLE =
  liveView({ dark: DARK_LIQUIDATE_PLANET_STYLE, cozy: COZY_LIQUIDATE_PLANET_STYLE });
