import { fireEvent, render, screen } from '@testing-library/react-native';
import { FirstRunCard } from '@/home/LauncherParts';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());
jest.mock('@/providers/SettingsProvider', () => ({
  useFeedbackPrefs: () => ({ reducedMotion: true, haptics: false }),
}));

/**
 * A first launch's one question (`ux-fix-ideas.md` §4.4), which replaced the
 * redirect into the tour: which game, and does the player know it.
 */
describe('FirstRunCard', () => {
  it('offers all five games, chess first', () => {
    render(<FirstRunCard onPlay={jest.fn()} onLearn={jest.fn()} />);
    for (const name of ['Chess', 'Checkers', 'Reversi', 'Go', 'Liquidate']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Chess' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Play Chess' })).toBeTruthy();
  });

  it('plays or teaches the game that was picked', () => {
    const onPlay = jest.fn();
    const onLearn = jest.fn();
    render(<FirstRunCard onPlay={onPlay} onLearn={onLearn} />);

    fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByRole('button', { name: 'Go' })).toBeSelected();

    fireEvent.press(screen.getByRole('button', { name: 'Play Go' }));
    expect(onPlay).toHaveBeenCalledWith('go');

    fireEvent.press(screen.getByRole('button', { name: 'I’m new to Go' }));
    expect(onLearn).toHaveBeenCalledWith('go');
  });
});
