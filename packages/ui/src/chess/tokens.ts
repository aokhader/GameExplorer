/**
 * Shared design tokens for the chess board and pieces.
 * Import these in both web and mobile so colors stay identical everywhere.
 *
 * Board palette is GameExplorer's "Arcade Glow" identity — a dark blue-slate
 * board that lets the chess neon-blue accent glow around it. Deliberately
 * distinct from Lichess (brown #f0d9b5/#b58863 + green) and chess.com (green
 * #769656/#eeeed2). Do not reintroduce those competitor values.
 */

import { liveView } from '../themeRuntime';

const DARK_BOARD_COLORS = {
  lightSquare: '#445576',
  darkSquare: '#2a3550',
  selectedSquare: '#cda43f',
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark: 'rgba(205,164,63,0.52)',
  // Legal-move hints glow teal on the dark board (was dark-on-light).
  moveIndicator: 'rgba(34,211,170,0.85)',
  moveIndicatorCapture: 'rgba(34,211,170,0.55)',
  /** Board frame. Web reads `--gx-board-frame`; native draws a real border. */
  frame: '#2b3652',
} as const;

/**
 * Cozy Tabletop chess board — the walnut table from the design doc: warm wood
 * squares in a dark frame, with forest green (the theme's action color) carrying
 * selection, last move and legal-move hints.
 */
const COZY_BOARD_COLORS = {
  lightSquare: '#e7c9a0',
  darkSquare: '#a9743f',
  selectedSquare: '#2f6e4e',
  lastMoveLight: 'rgba(47,110,78,0.38)',
  lastMoveDark: 'rgba(47,110,78,0.50)',
  moveIndicator: 'rgba(47,110,78,0.65)',
  moveIndicatorCapture: 'rgba(47,110,78,0.50)',
  frame: '#6e4a2a',
} as const;

/** Live view — see `themeRuntime.ts`. Web stays pinned to `dark`. */
export const BOARD_COLORS =
  liveView({ dark: DARK_BOARD_COLORS, cozy: COZY_BOARD_COLORS });

/**
 * "Game Pieces" design system — chess pieces. Keeps the design doc's per-side
 * coloring (`Game Pieces.dc.html`, section 01): a vertical metallic gradient —
 * white→silver for the light side, slate→ink with a light-blue outline stroke
 * for the dark side (so it reads on dark squares).
 *
 * The shapes are now real vector paths (see `piecePaths.ts`) instead of Unicode
 * font glyphs, so they render pixel-identical on web, iOS and Android with no
 * font substitution. `body` layers take `fill`/`stroke`; `detail` (engraving)
 * layers take `detail` — dark on the light side, light on the dark side.
 * `strokeWidth` is in the pieces' 4096-unit viewBox. Consumed by both
 * ChessPiece.tsx (web) and ChessPiece.native.tsx — one source of truth.
 */
export interface ChessPieceSide {
  /** Vertical gradient stops down the piece. */
  readonly fill: readonly { readonly offset: number; readonly color: string }[];
  /** Outline color, or null for no outline. */
  readonly stroke: string | null;
  /** Outline width in the pieces' 4096-unit viewBox. */
  readonly strokeWidth: number;
  /** Engraving lines painted over the body. */
  readonly detail: string;
}

export interface ChessPieceStyle {
  readonly white: ChessPieceSide;
  readonly black: ChessPieceSide;
}

const DARK_CHESS_PIECE_STYLE: ChessPieceStyle = {
  white: {
    // linear-gradient(180deg, #ffffff, #eef2f8 55%, #ccd6e4)
    fill: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.55, color: '#eef2f8' },
      { offset: 1, color: '#ccd6e4' },
    ],
    /** No outline on the light side — the silver body reads on the dark board. */
    stroke: null,
    strokeWidth: 0,
    /** Dark engraving lines on the silver body. */
    detail: '#2b3653',
  },
  black: {
    // linear-gradient(180deg, #51617f, #293350 52%, #0d1526)
    fill: [
      { offset: 0, color: '#51617f' },
      { offset: 0.52, color: '#293350' },
      { offset: 1, color: '#0d1526' },
    ],
    // Light-blue outline (was -webkit-text-stroke: 1px rgba(150,178,222,.5)).
    stroke: 'rgba(150,178,222,0.5)',
    strokeWidth: 34,
    /** Light engraving lines on the navy body. */
    detail: '#cdd9ef',
  },
};

/**
 * Cozy Tabletop pieces — cream against near-black walnut. Unlike Arcade Glow,
 * BOTH sides carry an outline: the light square is itself a warm cream, so an
 * unstroked pale piece would dissolve into it.
 */
const COZY_CHESS_PIECE_STYLE: ChessPieceStyle = {
  white: {
    fill: [
      { offset: 0, color: '#fdf8ee' },
      { offset: 0.55, color: '#f2e4cc' },
      { offset: 1, color: '#ddcaa8' },
    ],
    stroke: 'rgba(90,60,30,0.55)',
    strokeWidth: 26,
    detail: '#7c5230',
  },
  black: {
    fill: [
      { offset: 0, color: '#5a4636' },
      { offset: 0.52, color: '#33200f' },
      { offset: 1, color: '#1c1008' },
    ],
    stroke: 'rgba(240,225,200,0.35)',
    strokeWidth: 26,
    detail: '#e0cba8',
  },
};

export const CHESS_PIECE_STYLE: ChessPieceStyle =
  liveView({ dark: DARK_CHESS_PIECE_STYLE, cozy: COZY_CHESS_PIECE_STYLE });
