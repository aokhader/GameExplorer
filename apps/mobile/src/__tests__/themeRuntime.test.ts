/**
 * The mobile theme switch rests on one non-obvious property: the shared token
 * objects are LIVE VIEWS, so an existing `COLORS.surface` read returns whichever
 * theme is active without the 359 call sites changing. These tests pin that
 * behaviour down — if someone converts a token block back to a plain object, the
 * app would silently freeze on Arcade Glow and only a device would show it.
 */
import {
  COLORS,
  GAME_ACCENTS,
  BOARD_COLORS,
  CHECKERS_BOARD_COLORS,
  REVERSI_BOARD_COLORS,
  CHESS_PIECE_STYLE,
  LIQUIDATE_BOARD_COLORS,
  SHADOWS_NATIVE,
  getActiveTheme,
  setActiveTheme,
} from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

afterEach(() => setActiveTheme('dark'));

describe('theme runtime', () => {
  it('defaults to Arcade Glow', () => {
    expect(getActiveTheme()).toBe('dark');
    expect(COLORS.surface).toBe('#0b0e17');
  });

  it('repoints the semantic palette without reassigning the import', () => {
    const palette = COLORS; // the same object reference throughout
    expect(palette.surface).toBe('#0b0e17');

    setActiveTheme('cozy');

    expect(palette).toBe(COLORS);
    expect(palette.surface).toBe('#efe6d3');
    expect(palette.accent).toBe('#2f6e4e');
    expect(palette.fg).toBe('#2c2117');
  });

  it('switches every board and piece token set', () => {
    setActiveTheme('cozy');
    expect(BOARD_COLORS.lightSquare).toBe('#e7c9a0');
    expect(BOARD_COLORS.darkSquare).toBe('#a9743f');
    expect(CHECKERS_BOARD_COLORS.lightSquare).toBe('#e7c9a0');
    expect(REVERSI_BOARD_COLORS.cell).toBe('#2f6e4e');
    // Liquidate's Tabletop board is card stock, not dark wood — unlike chess and
    // reversi it is the LIGHTEST surface in the cozy theme, so its own fg pair
    // flips with the page rather than staying light against it.
    expect(LIQUIDATE_BOARD_COLORS.tile).toBe('#fdf8ef');
    expect(LIQUIDATE_BOARD_COLORS.tileFg).toBe('#382a1b');
    // The Arcade light piece has no outline; the Cozy one needs one, because the
    // light square is itself cream.
    expect(CHESS_PIECE_STYLE.white.stroke).not.toBeNull();
  });

  it('switches per-game accents and native shadows', () => {
    setActiveTheme('cozy');
    expect(GAME_ACCENTS.chess.base).toBe('#8b5a2b');
    expect(GAME_ACCENTS.checkers.base).toBe('#2f6e4e');
    // Arcade's shadows are pure black; Cozy's are warm brown.
    expect(SHADOWS_NATIVE.md.shadowColor).not.toBe('#000');
  });

  it('switches the type pairing', () => {
    expect(FONTS.body).toBe('DMSans_400Regular');
    setActiveTheme('cozy');
    expect(FONTS.body).toBe('NunitoSans_400Regular');
    expect(FONTS.display).toBe('Spectral_800ExtraBold');
  });

  it('restores Arcade Glow on switch back', () => {
    setActiveTheme('cozy');
    setActiveTheme('dark');
    expect(COLORS.surface).toBe('#0b0e17');
    expect(BOARD_COLORS.lightSquare).toBe('#445576');
    expect(GAME_ACCENTS.chess.base).toBe('#3b82f6');
    expect(FONTS.body).toBe('DMSans_400Regular');
  });
});
