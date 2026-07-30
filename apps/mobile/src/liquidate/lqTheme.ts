import {
  COZY_LIQUIDATE_SEAT_COLORS,
  LIQUIDATE_DECK_STYLE,
  LIQUIDATE_PANEL_COLORS,
  LIQUIDATE_SEAT_COLORS,
  LIQUIDATE_SYSTEM_COLORS,
  getActiveTheme,
  type LiquidateSystemKey,
} from '@gameexplorer/ui';
import type { LiquidateTile } from '@gameexplorer/shared';

/**
 * Liquidate's palette derivations for native.
 *
 * This file holds **functions only, deliberately**. Web's equivalent can export
 * an `LQ` object because every value there is a CSS-variable *string*; on native
 * the token objects are live views (getters), so a module-scope
 * `const LQ = { tile: LIQUIDATE_BOARD_COLORS.tile }` would resolve once at
 * import and freeze the board to whichever theme happened to be active — which
 * is exactly what `src/__tests__/noFrozenTokens.test.ts` fails the build on.
 *
 * Components import the token objects straight from `@gameexplorer/ui` and read
 * them inline in JSX, the same way `ReversiBoard` reads `REVERSI_BOARD_COLORS`.
 */

/** The colour for one star system, in the active theme. */
export function systemColor(system: LiquidateSystemKey): string {
  return LIQUIDATE_SYSTEM_COLORS[system];
}

/**
 * The seat colour for a seat index, wrapping past six players.
 *
 * The seat ramps are plain arrays rather than live views — `liveView` builds an
 * object of getters, which would lose `.length` and the array methods the wrap
 * below depends on — so the theme is switched on here by hand.
 */
export function seatColor(seat: number): string {
  const ramp = getActiveTheme() === 'cozy' ? COZY_LIQUIDATE_SEAT_COLORS : LIQUIDATE_SEAT_COLORS;
  const i = ((seat % ramp.length) + ramp.length) % ramp.length;
  return ramp[i]!;
}

/**
 * The accent a tile wears: its system hue for planets, and a fixed hue per kind
 * for everything else. Gates and utilities are ownable but belong to no system,
 * so they get their own colours rather than borrowing one.
 */
export function tileAccent(tile: LiquidateTile): string {
  if (tile.kind === 'planet') return systemColor(tile.system);
  if (tile.kind === 'warp-gate') return LIQUIDATE_PANEL_COLORS.gate;
  if (tile.kind === 'utility') return LIQUIDATE_PANEL_COLORS.utility;
  if (tile.kind === 'anomaly') return LIQUIDATE_DECK_STYLE.anomaly.base;
  if (tile.kind === 'federation') return LIQUIDATE_DECK_STYLE.federation.base;
  return LIQUIDATE_PANEL_COLORS.soft;
}

/**
 * The mark a non-property tile carries.
 *
 * Original glyphs, not any existing game's. Properties return `''` — their
 * colour bar is their identity, and a glyph under it would crowd the name out
 * of an already narrow cell.
 */
export function tileGlyph(tile: LiquidateTile): string {
  switch (tile.kind) {
    case 'home-station':
      return '⌂';
    case 'impound':
      return '⊗';
    case 'drift':
      return '≈';
    case 'contraband-scan':
      return '◎';
    case 'tariff':
      return '⇲';
    case 'warp-gate':
      return '◇';
    case 'utility':
      return '⚡';
    case 'anomaly':
      return LIQUIDATE_DECK_STYLE.anomaly.glyph;
    case 'federation':
      return LIQUIDATE_DECK_STYLE.federation.glyph;
    default:
      return '';
  }
}
