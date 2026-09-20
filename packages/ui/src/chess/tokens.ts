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

/*
 * The board's state budget — four hues, all translucent, none glowing, none
 * moving (`project-docs/ux-fix-ideas.md` §5.1):
 *
 *   what just happened   last move            gold (Arcade) / olive-gold (Cozy)
 *   what you can do      selection, dots,     teal (Arcade) / forest green (Cozy)
 *                        capture corners
 *   what you asked for   queued premove       violet (Arcade) / slate blue (Cozy)
 *   what is wrong        check                red
 *
 * Every state tint is laid OVER the square's own colour — never swapped in for
 * it — so the ΔE figures below are between the tinted and the plain square.
 * Contrast is tuned per board, not per state: on walnut, gold washes out
 * (ΔE2000 ≈ 7 against the light square), so Cozy's last move leans olive.
 * Selection no longer shares a hue with the last move, which used to paint a
 * selected piece standing on a last-move square gold on gold.
 *
 * The same values serve the checkers board — one budget for both grids.
 */
const DARK_BOARD_COLORS = {
  lightSquare: '#445576',
  darkSquare: '#2a3550',
  /** Selection tint — ΔE ≈ 30 / 34 on the light / dark square, 25 from last move. */
  selectedSquare: 'rgba(34,211,170,0.50)',
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark: 'rgba(205,164,63,0.52)',
  /** Legal-move dot, drawn at 22% of the square. */
  moveIndicator: 'rgba(34,211,170,0.60)',
  /** Capture target: the square's corners, clear to 80% of its half-diagonal. */
  moveIndicatorCapture: 'rgba(34,211,170,0.45)',
  /**
   * Queued premove — violet, deliberately outside the gold last-move / teal
   * legal-move families: "what I've asked for" must never read as "what just
   * happened" or "what I can do now". Web pairs these with `--gx-board-premove`.
   */
  premove: 'rgba(139,92,246,0.60)',
  premoveHint: 'rgba(139,92,246,0.75)',
  /** Centre of the still radial gradient under a king in check. */
  check: 'rgba(239,68,68,0.95)',
  /** Board frame. Web reads `--gx-board-frame`; native draws a real border. */
  frame: '#2b3652',
} as const;

/**
 * Cozy Tabletop chess board — the walnut table from the design doc: warm wood
 * squares in a dark frame. Forest green (the theme's action colour) carries
 * what you can do; the last move is a yellow-olive so it never matches it.
 *
 * The last-move hue was measured against the board it lands on, which is what
 * `ux-fix-ideas.md` §5.1 asks for and what lila did when its own last-move
 * colour vanished on green boards (#5776). Wood is a hard ground for a warm
 * highlight: the Arcade board reaches ΔE2000 29/37 on its slate squares, and no
 * translucent warm overlay on wood comes near that. The reference is therefore
 * what a real wood board achieves — chessground's brown board scores 16.4 light
 * and 20.4 dark. The olive this started at (rgba(150,150,20,…)) measured
 * 15.2/15.2, at parity on the light square and a quarter short on the dark one.
 * Nudging the hue to a yellow-olive at the SAME alphas gives 17.8/22.3, past the
 * reference on both, while staying 18.6 clear of the forest-green selection and
 * 34+ from premove and check. The look moves by ΔE 5.5 — a nudge, not a restyle.
 */
const COZY_BOARD_COLORS = {
  lightSquare: '#e7c9a0',
  darkSquare: '#a9743f',
  selectedSquare: 'rgba(47,110,78,0.55)',
  lastMoveLight: 'rgba(143,174,12,0.55)',
  lastMoveDark: 'rgba(143,174,12,0.60)',
  moveIndicator: 'rgba(47,110,78,0.65)',
  moveIndicatorCapture: 'rgba(47,110,78,0.50)',
  // Slate blue rather than Arcade's violet: on walnut it stays clearly apart
  // from the green "your move" family without going neon.
  premove: 'rgba(45,90,140,0.55)',
  premoveHint: 'rgba(45,90,140,0.70)',
  check: 'rgba(190,30,30,0.9)',
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
