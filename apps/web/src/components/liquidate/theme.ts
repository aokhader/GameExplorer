import {
  LIQUIDATE_BOARD_COLORS,
  LIQUIDATE_PANEL_COLORS,
  LIQUIDATE_SEAT_COLORS,
  LIQUIDATE_SYSTEM_COLORS,
  type LiquidateSystemKey,
} from '@gameexplorer/ui';
import { isOwnable, type LiquidateTile } from '@gameexplorer/shared';

/**
 * Liquidate's palette, read from the `--gx-liquidate-*` / `--c-liquidate-*`
 * variables that globals.css declares per theme, with the shared token as the
 * fallback so the board is still correct on its own.
 *
 * This is the same contract the other boards use (see `CheckersBoard`), and it
 * exists for the same reason: the live-view tokens in `@gameexplorer/ui` are
 * pinned to `dark` on web, because web never calls `setActiveTheme` — it themes
 * through the cascade. Read at module scope is fine here precisely BECAUSE the
 * value is a CSS variable reference rather than a resolved colour.
 *
 * Two themes are wired: "Command Deck" (default, dark) and "Tabletop"
 * (`[data-theme='cozy']`, parchment). The board surface flips between them, so
 * anything drawn on a tile must take its ink from `LQ.ink` / `LQ.dim`, never
 * from the page's `text-fg`.
 */
export const LQ = {
  // Board surfaces
  frame: `var(--c-liquidate-frame, ${LIQUIDATE_BOARD_COLORS.frame})`,
  tile: `var(--c-liquidate-tile, ${LIQUIDATE_BOARD_COLORS.tile})`,
  corner: `var(--c-liquidate-corner, ${LIQUIDATE_BOARD_COLORS.corner})`,
  well: `var(--c-liquidate-well, ${LIQUIDATE_BOARD_COLORS.well})`,
  tileLine: `var(--gx-liquidate-tile-line, ${LIQUIDATE_BOARD_COLORS.border})`,
  activeRing: `var(--c-liquidate-active-ring, ${LIQUIDATE_BOARD_COLORS.activeRing})`,
  mortgaged: `var(--c-liquidate-mortgaged, ${LIQUIDATE_BOARD_COLORS.mortgaged})`,

  // Chrome — panels sitting on the board's art, not on the page surface
  panel: `var(--gx-liquidate-panel, ${LIQUIDATE_PANEL_COLORS.panel})`,
  panel2: `var(--gx-liquidate-panel-2, ${LIQUIDATE_PANEL_COLORS.panel2})`,
  line: `var(--gx-liquidate-line, ${LIQUIDATE_PANEL_COLORS.line})`,
  ink: `var(--gx-liquidate-ink, ${LIQUIDATE_PANEL_COLORS.ink})`,
  dim: `var(--gx-liquidate-dim, ${LIQUIDATE_PANEL_COLORS.dim})`,
  soft: `var(--gx-liquidate-soft, ${LIQUIDATE_PANEL_COLORS.soft})`,
  accent: `var(--gx-liquidate-accent, ${LIQUIDATE_PANEL_COLORS.accent})`,
  accentInk: `var(--gx-liquidate-accent-ink, ${LIQUIDATE_PANEL_COLORS.accentInk})`,
  you: `var(--gx-liquidate-you, ${LIQUIDATE_PANEL_COLORS.you})`,
  track: `var(--gx-liquidate-track, ${LIQUIDATE_PANEL_COLORS.track})`,
  rowLine: `var(--gx-liquidate-row-line, ${LIQUIDATE_PANEL_COLORS.rowLine})`,
  hint: `var(--gx-liquidate-hint, ${LIQUIDATE_PANEL_COLORS.hint})`,
  hintLine: `var(--gx-liquidate-hint-line, ${LIQUIDATE_PANEL_COLORS.hintLine})`,
  hintInk: `var(--gx-liquidate-hint-ink, ${LIQUIDATE_PANEL_COLORS.hintInk})`,
  gate: `var(--gx-liquidate-gate, ${LIQUIDATE_PANEL_COLORS.gate})`,
  utility: `var(--gx-liquidate-util, ${LIQUIDATE_PANEL_COLORS.utility})`,

  panelShadow: 'var(--gx-liquidate-panel-shadow, 0 2px 14px rgba(0,0,0,0.35))',
  diceShadow: 'var(--gx-liquidate-dice-shadow, inset 0 -3px 8px rgba(0,0,0,0.35))',
  glow: 'var(--gx-liquidate-glow, none)',

  /** Display face + its per-theme expression (Space Grotesk 700 vs Spectral 400). */
  dispFont: 'var(--font-display)',
  dispWeight: 'var(--gx-liquidate-disp-weight, 700)',
  dispSpace: 'var(--gx-liquidate-disp-space, -0.02em)',
} as const;

/** The colour for one star system. */
export function systemColor(system: LiquidateSystemKey): string {
  return `var(--gx-liquidate-system-${system}, ${LIQUIDATE_SYSTEM_COLORS[system]})`;
}

/** The seat colour for a seat index, wrapping past six players. */
export function seatColor(seat: number): string {
  const i = ((seat % LIQUIDATE_SEAT_COLORS.length) + LIQUIDATE_SEAT_COLORS.length) %
    LIQUIDATE_SEAT_COLORS.length;
  return `var(--gx-liquidate-seat-${i + 1}, ${LIQUIDATE_SEAT_COLORS[i]})`;
}

/**
 * The accent a tile wears: its system hue for planets, and a fixed hue per kind
 * for everything else. Gates and utilities are ownable but belong to no system,
 * so they get their own colours rather than borrowing one.
 */
export function tileAccent(tile: LiquidateTile): string {
  if (tile.kind === 'planet') return systemColor(tile.system);
  if (tile.kind === 'warp-gate') return LQ.gate;
  if (tile.kind === 'utility') return LQ.utility;
  if (tile.kind === 'anomaly') return LQ.you;
  if (tile.kind === 'federation') return LQ.accent;
  return LQ.soft;
}

/** Human-readable name for a tile's group, for the inspector and legend. */
export function groupLabel(tile: LiquidateTile): string {
  if (tile.kind === 'planet') {
    return `${tile.system.charAt(0).toUpperCase()}${tile.system.slice(1)} system`;
  }
  if (tile.kind === 'warp-gate') return 'Warp gate';
  if (tile.kind === 'utility') return 'Utility';
  if (tile.kind === 'anomaly') return 'Anomaly deck';
  if (tile.kind === 'federation') return 'Federation deck';
  if (tile.kind === 'tariff') return 'Tariff';
  return 'Station';
}

/** True when the tile takes a colour bar across its head (properties only). */
export function hasColorBar(tile: LiquidateTile): boolean {
  return isOwnable(tile);
}

/**
 * Per-cell metrics for the two board sizes.
 *
 * The 44-tile loop packs 12 tiles a side against the 28-tile loop's 8, so every
 * tile is ~40% narrower at the same board width. Rather than scale one set of
 * numbers, each board gets its own: the dense board drops the bar height and
 * padding first, because those cost the label its second line.
 */
export interface TileMetrics {
  /** Height of the system colour bar, in px. */
  barH: number;
  /** Padding inside the tile face, in px. */
  pad: number;
  glyphF: number;
  nameF: number;
  priceF: number;
  /** Edge of one player token, in px. */
  tokenW: number;
  /** Hide the price line below this cell size — the name has to survive first. */
  showPrice: boolean;
  /**
   * Show the corner/tariff note ("Just visiting", "Pay ₡200").
   *
   * Needs MORE room than the price: those tiles carry the longest names on the
   * board ("Contraband Scan", "Deep-Space Drift"), so the note and a two-line
   * name are competing for the same few pixels — and when both render, they
   * collide. The note goes first; the inspector still has it.
   */
  showSub: boolean;
  showGlyph: boolean;
  /** Hide the owner swatch + pips row; the base stripe still shows ownership. */
  showOwnerRow: boolean;
  /**
   * Lines the name may wrap to. Drops to one on a 44-tile board at phone width,
   * where two lines do not fit the cell and would be clipped mid-word — a
   * truncated single line at least ends cleanly, and the inspector has the rest.
   */
  nameLines: 1 | 2;
}

export function tileMetrics(cellPx: number, perSide: number): TileMetrics {
  const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));
  const dense = perSide >= 12;
  return {
    barH: clamp(4, cellPx * (dense ? 0.1 : 0.13), 11),
    pad: clamp(3, cellPx * (dense ? 0.08 : 0.1), 8),
    glyphF: clamp(9, cellPx * (dense ? 0.2 : 0.24), 17),
    // 8.5px is the floor at which a two-line name is still readable. The 44-tile
    // board hits it on any normal viewport — a 12-per-side ring cannot be given
    // bigger cells without breaking `BoardFrame`'s fit-the-viewport contract —
    // so the dense board leans on the centre inspector for anything longer.
    nameF: clamp(8.5, cellPx * (dense ? 0.145 : 0.15), 12),
    priceF: clamp(7, cellPx * (dense ? 0.12 : 0.13), 10.5),
    tokenW: clamp(7, cellPx * (dense ? 0.2 : 0.22), 14),
    showPrice: cellPx >= (dense ? 52 : 46),
    showSub: cellPx >= (dense ? 64 : 72),
    showGlyph: cellPx >= 34,
    showOwnerRow: cellPx >= (dense ? 56 : 50),
    nameLines: cellPx >= 30 ? 2 : 1,
  };
}
