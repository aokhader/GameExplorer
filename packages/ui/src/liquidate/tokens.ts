/**
 * Liquidate board + star-system tokens.
 *
 * Paired with the `--c-liquidate-*` custom properties in the web app's
 * `globals.css` — change a value here and change it there (same contract as the
 * other games' board tokens).
 *
 * The eight system colours are an original ramp chosen to read on the near-black
 * arcade base and to walk the spectrum in price order (cheap = hot, dear = gold),
 * so a player can rank a system at a glance without reading the price.
 */

import { liveView } from '../themeRuntime';

export const LIQUIDATE_SYSTEM_COLORS = {
  ember:   '#ef4444',
  rust:    '#f97316',
  amber:   '#eab308',
  verdant: '#22c55e',
  azure:   '#38bdf8',
  violet:  '#8b5cf6',
  crimson: '#f43f5e',
  aurum:   '#cda43f',
} as const;

export type LiquidateSystemKey = keyof typeof LIQUIDATE_SYSTEM_COLORS;

/** Board surfaces. Deliberately dark — the system bands supply the colour. */
const DARK_LIQUIDATE_BOARD_COLORS = {
  /** The board's outer frame / gutter between tiles. */
  frame: '#0b0e17',
  /** A normal tile face. */
  tile: '#141b2d',
  /** Corner tiles, set apart from the edges. */
  corner: '#1a2338',
  /** The open middle of the loop. */
  well: '#0d1220',
  /** Hairline between tiles. */
  border: '#2b3652',
  /** Ring on the tile the active player occupies. */
  activeRing: '#cda43f',
  /** Tint over a mortgaged holding. */
  mortgaged: 'rgba(244,63,94,0.22)',
  /** Text on a tile. The board is dark art in EVERY theme, so this never flips
   *  with the page's foreground — that is what turns tile labels invisible. */
  tileFg: '#e7ecf6',
  tileFgMuted: '#9aa6bd',
} as const;

/**
 * Cozy: a wooden board rather than a blue-slate one. It stays dark — a lit board
 * on a lit page has nothing to sit against — so its own fg pair stays light.
 */
const COZY_LIQUIDATE_BOARD_COLORS = {
  frame: '#2c1a0c',
  tile: '#3f3021',
  corner: '#513f2c',
  well: '#241408',
  border: '#5a4636',
  activeRing: '#d9a94e',
  mortgaged: 'rgba(192,104,90,0.28)',
  tileFg: '#f4ecd9',
  tileFgMuted: '#c4b99e',
} as const;

export const LIQUIDATE_BOARD_COLORS =
  liveView({ dark: DARK_LIQUIDATE_BOARD_COLORS, cozy: COZY_LIQUIDATE_BOARD_COLORS });

/** Per-seat token colours, in seat order — up to six players. */
export const LIQUIDATE_SEAT_COLORS = [
  '#38bdf8', // sky
  '#f43f5e', // rose
  '#a3e635', // lime
  '#eab308', // amber
  '#c084fc', // orchid
  '#22d3aa', // teal
] as const;

/** Styling for the two event decks, so cards and tiles agree. */
export const LIQUIDATE_DECK_STYLE = {
  anomaly: { base: '#c084fc', glyph: '✦' },
  federation: { base: '#38bdf8', glyph: '◈' },
} as const;
