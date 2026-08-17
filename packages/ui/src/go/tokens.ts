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

/**
 * Star points for a 9×9 board, as `[row, col]` zero-based from the bottom-left
 * — the 3-3 points and tengen. Larger boards have their own pattern; when 13×13
 * and 19×19 arrive this becomes a function of size.
 */
export const GO_STAR_POINTS_9: readonly (readonly [number, number])[] = [
  [2, 2], [2, 6], [4, 4], [6, 2], [6, 6],
];
