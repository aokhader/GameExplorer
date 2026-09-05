/**
 * Go board + stone tokens.
 *
 * Go's board is unlike the other three: there are no cells to colour, only a
 * wood field with a grid ruled across it, and the stones sit on the *lines'*
 * intersections rather than inside squares. So the board tokens name a surface,
 * a line, and the star points (hoshi) — the small marked intersections that a
 * 9×9 board carries at the four 3-3 points and tengen, the centre.
 *
 * Arcade Glow: a dark board, keeping the app's night look, ruled in warm ink so
 * the grid reads without glowing. Cozy Tabletop: real kaya-board yellow with
 * brown-black lines, the same "board is the lightest surface" move the Liquidate
 * redesign made for that theme.
 */
import { liveView } from '../themeRuntime';

const DARK_GO_BOARD_COLORS = {
  /** The wood field. */
  surface:     '#2a2118',
  /** Subtle grain wash drawn over the field. */
  surfaceEdge: '#1d160f',
  /** The ruled grid. */
  line:        'rgba(226,205,168,0.55)',
  /** Board edge lines, drawn heavier than the interior on a real board. */
  lineStrong:  'rgba(226,205,168,0.75)',
  /** Star points. */
  hoshi:       'rgba(226,205,168,0.85)',
  boardBorder: '#15100b',
  /** Coordinate labels around the edge. */
  coordinate:  'rgba(226,205,168,0.65)',
  /** Ring on the stone just played. */
  lastMoveRing: 'rgba(103,232,249,0.95)',
  /** The ghost stone shown under the cursor on a legal point. */
  ghost:       'rgba(226,205,168,0.35)',
  /** Training hint ring. */
  hintRing:    'rgba(245,158,11,0.95)',
  /**
   * The dead-stone review's territory markers — a small square on each point
   * the count is about to award, in the colour that is about to be awarded it.
   * Squares rather than dots on purpose: a dot at this size reads as a stone.
   */
  territoryBlack: 'rgba(12,16,24,0.88)',
  territoryWhite: 'rgba(245,240,230,0.92)',
  /** Hairline around those squares, so both read against the wood. */
  territoryEdge:  'rgba(226,205,168,0.5)',
};

const COZY_GO_BOARD_COLORS = {
  surface:     '#e8c88a',
  surfaceEdge: '#dcb771',
  line:        'rgba(45,30,15,0.62)',
  lineStrong:  'rgba(45,30,15,0.85)',
  hoshi:       'rgba(45,30,15,0.9)',
  boardBorder: '#8b5a2b',
  coordinate:  'rgba(45,30,15,0.7)',
  lastMoveRing: 'rgba(162,72,46,0.95)',
  ghost:       'rgba(45,30,15,0.28)',
  hintRing:    'rgba(138,102,29,0.95)',
  territoryBlack: 'rgba(18,12,7,0.88)',
  territoryWhite: 'rgba(255,253,247,0.95)',
  territoryEdge:  'rgba(45,30,15,0.5)',
};

export const GO_BOARD_COLORS =
  liveView({ dark: DARK_GO_BOARD_COLORS, cozy: COZY_GO_BOARD_COLORS });

/**
 * The two stone faces. Go stones are convex discs — slate and clamshell — so
 * they carry a much tighter, higher specular highlight than the reversi coins,
 * which is what separates the two games' pieces at a glance.
 */
const DARK_GO_STONE_STYLE = {
  black: {
    body: [
      { offset: 0, color: '#4a5468' },
      { offset: 0.55, color: '#1b2130' },
      { offset: 1, color: '#080b12' },
    ],
    border: 'rgba(255,255,255,0.14)',
    sheen: 'rgba(190,214,255,0.55)',
    shade: 'rgba(0,0,0,0.6)',
  },
  white: {
    body: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.55, color: '#eae3d6' },
      { offset: 1, color: '#c3bbab' },
    ],
    border: 'rgba(60,50,35,0.35)',
    sheen: 'rgba(255,255,255,0.95)',
    shade: 'rgba(40,30,18,0.35)',
  },
} as const;

/** Cozy: the same two stones under warm tabletop light. */
const COZY_GO_STONE_STYLE = {
  black: {
    body: [
      { offset: 0, color: '#544639' },
      { offset: 0.55, color: '#241a12' },
      { offset: 1, color: '#120c07' },
    ],
    border: 'rgba(255,255,255,0.12)',
    sheen: 'rgba(226,205,168,0.45)',
    shade: 'rgba(0,0,0,0.5)',
  },
  white: {
    body: [
      { offset: 0, color: '#fffdf7' },
      { offset: 0.55, color: '#f2e8d2' },
      { offset: 1, color: '#d3c4a4' },
    ],
    border: 'rgba(90,65,35,0.38)',
    sheen: 'rgba(255,255,255,0.95)',
    shade: 'rgba(80,55,25,0.30)',
  },
} as const;

export const GO_STONE_STYLE =
  liveView({ dark: DARK_GO_STONE_STYLE, cozy: COZY_GO_STONE_STYLE });

export type GoPoint = readonly [row: number, col: number];

/**
 * Star points (*hoshi*) for a board, as `[row, col]` zero-based from the
 * bottom-left.
 *
 * They are not decoration: they mark the handicap points, and players read the
 * whole board's geometry off them. The convention is fixed by centuries of
 * practice rather than by a formula, so it is spelled out here:
 *
 *  - the corner stars sit on the **3-3** points on 9×9 and on the **4-4**
 *    points from 13×13 up;
 *  - 9×9 and 13×13 mark four corners and tengen — five in all;
 *  - 19×19 also marks the four side midpoints, making the familiar nine.
 *
 * Anything else (an even size, or something smaller than 7) gets corners and,
 * where there is one, a centre — enough to orient by, and no invented tradition.
 */
export function goStarPoints(size: number): readonly GoPoint[] {
  if (size < 7) return [];

  const offset = size >= 13 ? 3 : 2;
  const far = size - 1 - offset;
  const centre = (size - 1) / 2;
  const hasCentre = Number.isInteger(centre);

  const points: GoPoint[] = [
    [offset, offset],
    [offset, far],
    [far, offset],
    [far, far],
  ];

  if (hasCentre) {
    if (size >= 19) {
      points.push([offset, centre], [centre, offset], [centre, far], [far, centre]);
    }
    points.push([centre, centre]);
  }

  return points;
}

/**
 * The 9×9 star points, kept as a named constant because it is what the boards
 * shipped with and what the tutorial diagrams are pinned against.
 */
export const GO_STAR_POINTS_9: readonly GoPoint[] = goStarPoints(9);
