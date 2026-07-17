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

export const PIECE_FILLS = {
  white: '#FAF9F7',
  black: '#2c1b08',
} as const;

export const PIECE_STROKES = {
  white: '#2c1b08',
  black: '#e8d5b5',
} as const;

/**
 * "Game Pieces" design system — chess glyphs (design doc `Game Pieces.dc.html`,
 * section 01, July 17 revision). The medallion tiles are gone: each piece is
 * now the classic filled glyph (♚♛♜♝♞♟) at play scale with a vertical
 * metallic gradient clipped to the glyph itself — white→silver for the light
 * side, slate→ink with a light-blue outline stroke for the dark side (so it
 * reads on dark squares). Consumed by both ChessPiece.tsx (web) and
 * ChessPiece.native.tsx — one source of truth.
 */
export const CHESS_PIECE_STYLE = {
  white: {
    // linear-gradient(180deg, #ffffff, #eef2f8 55%, #ccd6e4) clipped to text
    fill: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.55, color: '#eef2f8' },
      { offset: 1, color: '#ccd6e4' },
    ],
    /** No outline on the light side. */
    stroke: null,
  },
  black: {
    // linear-gradient(180deg, #51617f, #293350 52%, #0d1526) clipped to text
    fill: [
      { offset: 0, color: '#51617f' },
      { offset: 0.52, color: '#293350' },
      { offset: 1, color: '#0d1526' },
    ],
    // -webkit-text-stroke: 1px rgba(150,178,222,.5)
    stroke: 'rgba(150,178,222,0.5)',
  },
} as const;
