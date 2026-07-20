/**
 * Shared design tokens for the chess board and pieces.
 * Import these in both web and mobile so colors stay identical everywhere.
 *
 * Board palette is GameExplorer's "Arcade Glow" identity — a dark blue-slate
 * board that lets the chess neon-blue accent glow around it. Deliberately
 * distinct from Lichess (brown #f0d9b5/#b58863 + green) and chess.com (green
 * #769656/#eeeed2). Do not reintroduce those competitor values.
 */

export const BOARD_COLORS = {
  lightSquare: '#445576',
  darkSquare: '#2a3550',
  selectedSquare: '#cda43f',
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark: 'rgba(205,164,63,0.52)',
  // Legal-move hints glow teal on the dark board (was dark-on-light).
  moveIndicator: 'rgba(34,211,170,0.85)',
  moveIndicatorCapture: 'rgba(34,211,170,0.55)',
} as const;

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
export const CHESS_PIECE_STYLE = {
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
} as const;
