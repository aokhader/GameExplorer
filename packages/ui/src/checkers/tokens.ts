/**
 * Shared design tokens for the checkers board and pieces.
 *
 * "Arcade Glow" checkers: the same dark blue-slate arcade board as chess, but
 * framed by checkers' hot-pink signature glow (see GAME_ACCENTS) so the two
 * games never read alike. Discs are neon — warm gold vs electric blue — and jump
 * hints glow pink. Gold stays the shared selection/last-move brand. Pieces only
 * ever sit on dark squares, so both disc fills read with strong contrast on the
 * dark tone. Import in web + mobile.
 */

import { liveView } from '../themeRuntime';

const DARK_CHECKERS_BOARD_COLORS = {
  lightSquare: '#445576',          // arcade blue-slate (light)
  darkSquare:  '#2a3550',          // arcade blue-slate (dark)
  selectedSquare: '#cda43f',       // gold (shared brand)
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark:  'rgba(205,164,63,0.52)',
  moveIndicator: 'rgba(236,72,153,0.85)',   // pink hint on the dark board
  captureIndicator: 'rgba(236,72,153,0.75)',
  frame: '#2b3652',
};

/** Cozy: the same walnut table as chess, with green carrying every hint. */
const COZY_CHECKERS_BOARD_COLORS = {
  lightSquare: '#e7c9a0',
  darkSquare:  '#a9743f',
  selectedSquare: '#2f6e4e',
  lastMoveLight: 'rgba(47,110,78,0.38)',
  lastMoveDark:  'rgba(47,110,78,0.50)',
  moveIndicator: 'rgba(47,110,78,0.85)',
  captureIndicator: 'rgba(47,110,78,0.90)',
  frame: '#6e4a2a',
};

export const CHECKERS_BOARD_COLORS =
  liveView({ dark: DARK_CHECKERS_BOARD_COLORS, cozy: COZY_CHECKERS_BOARD_COLORS });

export const CHECKERS_PIECE_COLORS = {
  white: {
    fill:      '#f4d270',          // warm gold disc
    stroke:    '#8a6a1f',
    highlight: '#fff4d6',
    shadow:    '#5a3f10',
  },
  black: {
    fill:      '#3b82f6',          // electric blue disc
    stroke:    '#1e40af',
    highlight: '#bcd6ff',
    shadow:    '#0b1120',
  },
};

/**
 * "Game Pieces" design system — checkers discs (design doc `Game
 * Pieces.dc.html`, section 02). Gold = your side, blue = opponent; a man is a
 * clean gradient disc with a dashed inner ring, a king gains the ♛ face, a
 * solid ring, and the pink promotion halo (pink is the game's accent, not a
 * piece color). Consumed by both CheckersPiece variants.
 */
const DARK_CHECKERS_PIECE_STYLE = {
  white: {
    // radial-gradient(circle at 35% 28%, #fbe39a, #b8923a 74%)
    body: [
      { offset: 0, color: '#fbe39a' },
      { offset: 0.74, color: '#b8923a' },
      { offset: 1, color: '#a07c2d' },
    ],
    border: 'rgba(255,255,255,0.32)',
    ring: 'rgba(90,63,16,0.4)',
    kingGlyph: '#5a3f10',
    halo: 'rgba(205,164,63,0.9)',
    sheen: 'rgba(255,255,255,0.5)',
    shade: 'rgba(0,0,0,0.4)',
  },
  black: {
    // radial-gradient(circle at 35% 28%, #8bbaff, #2563eb 74%)
    body: [
      { offset: 0, color: '#8bbaff' },
      { offset: 0.74, color: '#2563eb' },
      { offset: 1, color: '#1d4fc4' },
    ],
    border: 'rgba(255,255,255,0.28)',
    ring: 'rgba(255,255,255,0.28)',
    kingGlyph: '#ffffff',
    halo: 'rgba(59,130,246,0.85)',
    sheen: 'rgba(255,255,255,0.35)',
    shade: 'rgba(0,0,0,0.45)',
  },
  /** Crowned pieces glow pink — the checkers signature accent. */
  promotionHalo: 'rgba(236,72,153,0.55)',
  /** King ring reads brighter than the man's dashed ring. */
  kingRing: { white: 'rgba(90,63,16,0.4)', black: 'rgba(255,209,236,0.55)' },
} as const;

/**
 * Cozy discs — carved cream vs terracotta, straight from the design's board.
 * Crowns take the opposite tone, and the promotion halo becomes the theme's
 * green (pink is an Arcade Glow signature that has no place on wood).
 */
const COZY_CHECKERS_PIECE_STYLE = {
  white: {
    body: [
      { offset: 0, color: '#fefaf0' },
      { offset: 0.74, color: '#d9c39a' },
      { offset: 1, color: '#c4ab7e' },
    ],
    border: 'rgba(120,80,40,0.35)',
    ring: 'rgba(139,90,43,0.35)',
    kingGlyph: '#8b5a2b',
    halo: 'rgba(201,162,74,0.55)',
    sheen: 'rgba(255,255,255,0.75)',
    shade: 'rgba(90,60,30,0.28)',
  },
  black: {
    body: [
      { offset: 0, color: '#d08678' },
      { offset: 0.74, color: '#7c2d1e' },
      { offset: 1, color: '#6a2416' },
    ],
    border: 'rgba(255,255,255,0.22)',
    ring: 'rgba(255,255,255,0.30)',
    kingGlyph: '#fbe6df',
    halo: 'rgba(162,72,46,0.60)',
    sheen: 'rgba(255,255,255,0.35)',
    shade: 'rgba(0,0,0,0.38)',
  },
  promotionHalo: 'rgba(47,110,78,0.50)',
  kingRing: { white: 'rgba(139,90,43,0.45)', black: 'rgba(255,225,215,0.60)' },
} as const;

export const CHECKERS_PIECE_STYLE =
  liveView({ dark: DARK_CHECKERS_PIECE_STYLE, cozy: COZY_CHECKERS_PIECE_STYLE });
