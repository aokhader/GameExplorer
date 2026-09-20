/**
 * Shared design tokens for the checkers board and pieces.
 *
 * "Arcade Glow" checkers: the same dark blue-slate arcade board as chess, with
 * the same state hues. The discs — warm gold vs electric blue — are what tell
 * the two games apart. Pieces only ever sit on dark squares, so both disc fills
 * read with strong contrast on the dark tone. Import in web + mobile.
 */

import { liveView } from '../themeRuntime';

/*
 * The same four-hue state budget as the chess board (see `chess/tokens.ts`):
 * gold for the last move, teal for what you can do, violet for a queued
 * premove. Checkers' pink survives in its piece art and its accent, not on the
 * squares — a destination means the same thing on every grid in the app.
 * Every tint is laid over the square's own colour.
 */
const DARK_CHECKERS_BOARD_COLORS = {
  lightSquare: '#445576',          // arcade blue-slate (light)
  darkSquare:  '#2a3550',          // arcade blue-slate (dark)
  selectedSquare: 'rgba(34,211,170,0.50)',
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark:  'rgba(205,164,63,0.52)',
  moveIndicator: 'rgba(34,211,170,0.60)',
  captureIndicator: 'rgba(34,211,170,0.45)',
  // Queued premove — violet, outside both the gold last-move and teal hint
  // families so a pending intent never reads as either.
  premove: 'rgba(139,92,246,0.60)',
  premoveHint: 'rgba(139,92,246,0.75)',
  frame: '#2b3652',
};

/** Cozy: the same walnut table and the same budget as the Cozy chess board. */
const COZY_CHECKERS_BOARD_COLORS = {
  lightSquare: '#e7c9a0',
  darkSquare:  '#a9743f',
  selectedSquare: 'rgba(47,110,78,0.55)',
  lastMoveLight: 'rgba(143,174,12,0.55)',
  lastMoveDark:  'rgba(143,174,12,0.60)',
  moveIndicator: 'rgba(47,110,78,0.65)',
  captureIndicator: 'rgba(47,110,78,0.50)',
  premove: 'rgba(45,90,140,0.55)',
  premoveHint: 'rgba(45,90,140,0.70)',
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
