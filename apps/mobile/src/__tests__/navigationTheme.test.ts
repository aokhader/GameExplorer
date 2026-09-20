import { COLORS, setActiveTheme, THEMES } from '@gameexplorer/ui';
import { navigationTheme } from '@/theme/navigationTheme';

afterEach(() => setActiveTheme('dark'));

describe('navigationTheme', () => {
  // The bug this pins: React Navigation's own `colors.background` is the layer
  // iOS shows through the display's rounded corners for the length of a stack
  // transition. Its default is `rgb(242, 242, 242)`, so leaving it alone flashed
  // four near-white corners on every push and every swipe-back.
  it('hands React Navigation the app surface as its background', () => {
    setActiveTheme('dark');
    expect(navigationTheme('dark').colors.background).toBe(THEMES.dark.surface);

    setActiveTheme('cozy');
    expect(navigationTheme('cozy').colors.background).toBe(THEMES.cozy.surface);
  });

  it('never leaves a library default colour in the palette', () => {
    setActiveTheme('dark');
    const { colors } = navigationTheme('dark');
    expect(colors).toEqual({
      primary: COLORS.accent,
      background: COLORS.surface,
      card: COLORS.surfaceAlt,
      text: COLORS.fg,
      border: COLORS.border,
      notification: COLORS.danger,
    });
  });

  it('marks cozy as a light theme and arcade as dark', () => {
    expect(navigationTheme('cozy').dark).toBe(false);
    expect(navigationTheme('dark').dark).toBe(true);
  });
});
