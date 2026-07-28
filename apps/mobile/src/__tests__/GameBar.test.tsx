import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GameBar } from '@/game/GameBar';
import { SettingsProvider } from '@/providers/SettingsProvider';

/** A 10-state timeline = 9 moves played. */
const TOTAL = 10;

type Handlers = {
  onSeek: jest.Mock;
  onFlipBoard: jest.Mock;
  onAgreeDraw: jest.Mock;
  onNewGame: jest.Mock;
  onResign: jest.Mock;
};

/**
 * The bar reads the haptics setting through `useGameSfx`, so it needs the
 * provider — and the provider hydrates from AsyncStorage, so every render awaits
 * that first paint to keep the state update inside `act`.
 */
async function renderBar(viewIndex: number, opts: { total?: number; gameOver?: boolean } = {}) {
  const handlers: Handlers = {
    onSeek: jest.fn(),
    onFlipBoard: jest.fn(),
    onAgreeDraw: jest.fn(),
    onNewGame: jest.fn(),
    onResign: jest.fn(),
  };
  render(
    <SettingsProvider>
      <GameBar
        viewIndex={viewIndex}
        total={opts.total ?? TOTAL}
        accent="chess"
        gameOver={opts.gameOver}
        {...handlers}
      />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: 'Previous move' });
  return handlers;
}

/**
 * jest-expo's Modal mock renders its children twice: an inert copy first, then
 * the live one that actually carries the press handlers and accessibility state.
 * Menu queries therefore take the LAST match, and assert on counts rather than
 * uniqueness.
 */
const menuItem = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;
const menuItemCount = (name: string) => screen.queryAllByRole('button', { name }).length;

describe('GameBar — history controls', () => {
  it('steps one move at a time in both directions', async () => {
    const { onSeek } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Previous move' }));
    expect(onSeek).toHaveBeenCalledWith(3);

    fireEvent.press(screen.getByRole('button', { name: 'Next move' }));
    expect(onSeek).toHaveBeenLastCalledWith(5);
  });

  it('offers no jump-to-end shortcuts — stepping only', async () => {
    await renderBar(4);
    expect(screen.queryByRole('button', { name: 'First move' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Latest move' })).toBeNull();
  });

  it('disables stepping back at the start', async () => {
    await renderBar(0);
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled();
  });

  it('disables stepping forward at the live position', async () => {
    await renderBar(TOTAL - 1);
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeEnabled();
  });

  it('never seeks past either end', async () => {
    const { onSeek } = await renderBar(0);
    fireEvent.press(screen.getByRole('button', { name: 'Previous move' }));
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('GameBar — resign flag', () => {
  it('needs a second tap before it forfeits', async () => {
    const { onResign } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    expect(onResign).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm resign' }));
    expect(onResign).toHaveBeenCalledTimes(1);
  });

  it('disarms itself if the second tap never comes', async () => {
    jest.useFakeTimers();
    try {
      const { onResign } = await renderBar(4);
      fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
      expect(screen.getByRole('button', { name: 'Confirm resign' })).toBeOnTheScreen();

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByRole('button', { name: 'Resign' })).toBeOnTheScreen();

      // Back to square one: the next tap only re-arms.
      fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
      expect(onResign).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('is disabled once the game is over', async () => {
    await renderBar(4, { gameOver: true });
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
  });
});

describe('GameBar — menu', () => {
  it('stays closed until the menu button is pressed', async () => {
    await renderBar(4);
    expect(menuItemCount('Flip board')).toBe(0);

    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    expect(menuItem('Flip board')).toBeOnTheScreen();
  });

  it('flips the board and closes', async () => {
    const { onFlipBoard } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.press(menuItem('Flip board'));

    expect(onFlipBoard).toHaveBeenCalledTimes(1);
    expect(menuItemCount('Flip board')).toBe(0);
  });

  it('starts a new game and closes', async () => {
    const { onNewGame } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.press(menuItem('New game'));

    expect(onNewGame).toHaveBeenCalledTimes(1);
    expect(menuItemCount('New game')).toBe(0);
  });

  it('agrees a draw and closes', async () => {
    const { onAgreeDraw } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.press(menuItem('Agree to a draw'));

    expect(onAgreeDraw).toHaveBeenCalledTimes(1);
    expect(menuItemCount('Agree to a draw')).toBe(0);
  });

  it('disables the draw once the game is over, but not the rest of the menu', async () => {
    await renderBar(4, { gameOver: true });
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));

    expect(menuItem('Agree to a draw')).toBeDisabled();
    expect(menuItem('Flip board')).toBeEnabled();
    expect(menuItem('New game')).toBeEnabled();
  });

  it('omits rows the game does not support', async () => {
    // Reversi passes neither handler: its board can't flip (playerColor doubles
    // as the pass-and-play tap gate) and it has no draws.
    const onSeek = jest.fn();
    render(
      <SettingsProvider>
        <GameBar
          viewIndex={4}
          total={TOTAL}
          accent="reversi"
          onSeek={onSeek}
          onNewGame={jest.fn()}
          onResign={jest.fn()}
        />
      </SettingsProvider>,
    );
    await screen.findByRole('button', { name: 'Previous move' });
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));

    expect(menuItemCount('Flip board')).toBe(0);
    expect(menuItemCount('Agree to a draw')).toBe(0);
    // The rest of the menu is unaffected.
    expect(menuItem('New game')).toBeOnTheScreen();
    expect(menuItem('Analysis (coming soon)')).toBeOnTheScreen();
  });

  it('dismisses on a backdrop tap without acting', async () => {
    const { onFlipBoard, onNewGame } = await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.press(menuItem('Close menu'));

    expect(menuItemCount('Flip board')).toBe(0);
    expect(onFlipBoard).not.toHaveBeenCalled();
    expect(onNewGame).not.toHaveBeenCalled();
  });
});

describe('GameBar — hint', () => {
  /** Training passes `onHint`; every other mode leaves the placeholder in place. */
  async function renderWithHint(props: {
    hintDisabled?: boolean;
    hintPending?: boolean;
    hintsUsed?: number;
    gameOver?: boolean;
  }) {
    const onHint = jest.fn();
    render(
      <SettingsProvider>
        <GameBar
          viewIndex={4}
          total={TOTAL}
          accent="chess"
          onSeek={jest.fn()}
          onNewGame={jest.fn()}
          onResign={jest.fn()}
          onHint={onHint}
          {...props}
        />
      </SettingsProvider>,
    );
    await screen.findByRole('button', { name: 'Previous move' });
    return onHint;
  }

  it('asks for a hint when training supplies a handler', async () => {
    const onHint = await renderWithHint({});
    fireEvent.press(screen.getByRole('button', { name: 'Hint' }));
    expect(onHint).toHaveBeenCalledTimes(1);
  });

  it('counts the hints already taken in its label', async () => {
    await renderWithHint({ hintsUsed: 3 });
    expect(screen.getByRole('button', { name: 'Hint — 3 used' })).toBeEnabled();
  });

  it("is disabled when it isn't the player's turn", async () => {
    await renderWithHint({ hintDisabled: true });
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
  });

  it('is disabled while a hint search is running', async () => {
    await renderWithHint({ hintPending: true });
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
  });

  it('is disabled once the game is over', async () => {
    await renderWithHint({ gameOver: true });
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
  });
});

describe('GameBar — placeholders', () => {
  it('shows Hint as disabled and labelled coming soon outside training', async () => {
    await renderBar(4);
    expect(screen.getByRole('button', { name: 'Hint (coming soon)' })).toBeDisabled();
  });

  it('shows Analysis in the menu as disabled and labelled coming soon', async () => {
    await renderBar(4);
    fireEvent.press(screen.getByRole('button', { name: 'Game menu' }));
    expect(menuItem('Analysis (coming soon)')).toBeDisabled();
    expect(screen.getAllByText('SOON').at(-1)!).toBeOnTheScreen();
  });
});
