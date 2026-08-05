import { fireEvent, render, screen } from '@testing-library/react-native';
import { PuzzleBar } from '@/puzzles/PuzzleBar';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The bar clicks on a seek through `useGameSfx`, so it needs the provider — and
 * the provider hydrates from AsyncStorage, so every render awaits that first
 * paint to keep the state update inside `act`. Same harness as the GameBar
 * tests, which is the point: this bar is that bar with the match controls taken
 * out.
 */
async function renderBar(overrides: Partial<React.ComponentProps<typeof PuzzleBar>> = {}) {
  const props = {
    accent: 'chess' as const,
    viewIndex: 0,
    total: 1,
    onSeek: jest.fn(),
    canHint: true,
    wrong: false,
    solved: false,
    onHint: jest.fn(),
    onRetry: jest.fn(),
    onNext: jest.fn(),
    ...overrides,
  };
  render(
    <SettingsProvider>
      <PuzzleBar {...props} />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: 'Previous position' });
  return props;
}

describe('PuzzleBar', () => {
  it('offers the puzzle actions and the history controls', async () => {
    await renderBar();
    for (const label of ['Hint', 'Retry', 'Next puzzle', 'Previous position', 'Next position']) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
  });

  it('brings none of the game bar’s match controls with it', async () => {
    await renderBar();
    // A puzzle has nobody to concede to and no board worth turning around.
    for (const label of ['Resign', 'Game menu', 'Flip board', 'Agree to a draw']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('fires each action', async () => {
    const props = await renderBar();
    fireEvent.press(screen.getByLabelText('Hint'));
    fireEvent.press(screen.getByLabelText('Retry'));
    fireEvent.press(screen.getByLabelText('Next puzzle'));
    expect(props.onHint).toHaveBeenCalledTimes(1);
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('disables the hint when it is not the player’s move', async () => {
    const props = await renderBar({ canHint: false });
    const hint = screen.getByLabelText('Hint');
    expect(hint).toBeDisabled();
    fireEvent.press(hint);
    expect(props.onHint).not.toHaveBeenCalled();
  });

  it('renames retry to “Try again” after a wrong move', async () => {
    await renderBar({ wrong: true });
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Retry')).toBeNull();
  });

  it('leaves nothing to retry once the puzzle is solved', async () => {
    const props = await renderBar({ solved: true });
    const retry = screen.getByLabelText('Retry');
    expect(retry).toBeDisabled();
    fireEvent.press(retry);
    expect(props.onRetry).not.toHaveBeenCalled();
    // Next stays live — it is the way out of a solved puzzle.
    fireEvent.press(screen.getByLabelText('Next puzzle'));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  describe('history controls', () => {
    it('are both dead on a puzzle that has not moved yet', async () => {
      const props = await renderBar({ viewIndex: 0, total: 1 });
      expect(screen.getByLabelText('Previous position')).toBeDisabled();
      expect(screen.getByLabelText('Next position')).toBeDisabled();
      fireEvent.press(screen.getByLabelText('Previous position'));
      expect(props.onSeek).not.toHaveBeenCalled();
    });

    it('step one position at a time', async () => {
      const props = await renderBar({ viewIndex: 1, total: 3 });
      fireEvent.press(screen.getByLabelText('Previous position'));
      expect(props.onSeek).toHaveBeenLastCalledWith(0);
      fireEvent.press(screen.getByLabelText('Next position'));
      expect(props.onSeek).toHaveBeenLastCalledWith(2);
    });

    it('stop at the ends', async () => {
      const props = await renderBar({ viewIndex: 2, total: 3 });
      expect(screen.getByLabelText('Next position')).toBeDisabled();
      fireEvent.press(screen.getByLabelText('Next position'));
      expect(props.onSeek).not.toHaveBeenCalled();
      // …and the caller never has to clamp: the bar refuses to overshoot.
      fireEvent.press(screen.getByLabelText('Previous position'));
      expect(props.onSeek).toHaveBeenCalledWith(1);
    });
  });
});
