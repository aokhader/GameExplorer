import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { UnfinishedGame } from '@gameexplorer/client/game/unfinishedGame';
import { ContinueCard, SetupStartFooter } from '@/game/ContinueCard';

// Buttons carry their own press motion; the flattened stand-in applies.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());
jest.mock('@/providers/SettingsProvider', () => ({
  useFeedbackPrefs: () => ({ reducedMotion: true, haptics: false }),
}));

/**
 * `ux-fix-ideas.md` §2.4, decided by the owner: an unfinished rated game stays
 * open until finished or resigned, so discarding one *is* resigning — and the
 * card has to say so before it happens. A casual game just goes.
 */

function game(overrides: Partial<UnfinishedGame> = {}): UnfinishedGame {
  return {
    v: 1,
    game: 'chess',
    mode: 'bot',
    userId: 'u1',
    rated: true,
    playerColor: 'white',
    botElo: 1500,
    setup: {},
    actions: [{ from: 'e2', to: 'e4' }],
    hintsUsed: 0,
    startedAt: 1,
    savedAt: 2,
    ...overrides,
  };
}

describe('ContinueCard', () => {
  it('says what the game is', () => {
    render(<ContinueCard saved={game()} onResume={jest.fn()} onSettle={jest.fn()} settling={false} />);
    expect(screen.getByText('Game in progress')).toBeTruthy();
    expect(screen.getByText('vs Bot 1500 · Rated · You play White · move 1')).toBeTruthy();
  });

  it('asks before discarding a rated game, and says it counts as a loss', async () => {
    const onSettle = jest.fn(async () => ({ kind: 'recorded' as const, rating: {} as never }));
    render(<ContinueCard saved={game()} onResume={jest.fn()} onSettle={onSettle} settling={false} />);

    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(onSettle).not.toHaveBeenCalled();
    expect(screen.getByText('Discarding a rated game counts as a loss.')).toBeTruthy();

    // Changing one's mind puts the card back as it was.
    fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.press(screen.getByRole('button', { name: 'Resign it' }));
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith({ resign: true }));
  });

  it('discards a casual game at once', async () => {
    const onSettle = jest.fn(async () => ({ kind: 'deleted' as const }));
    render(<ContinueCard saved={game({ rated: false })} onResume={jest.fn()} onSettle={onSettle} settling={false} />);

    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith({ resign: true }));
  });

  it('shows why a failed resignation did not go through', async () => {
    const onSettle = jest.fn(async () => {
      throw new Error('offline');
    });
    render(<ContinueCard saved={game()} onResume={jest.fn()} onSettle={onSettle} settling={false} />);

    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.press(screen.getByRole('button', { name: 'Resign it' }));
    expect(await screen.findByText(/Couldn't save the result/)).toBeTruthy();
  });

  it('offers only to save the result of a game that already ended', async () => {
    const onSettle = jest.fn(async () => ({ kind: 'recorded' as const, rating: {} as never }));
    render(<ContinueCard saved={game({ end: 'over' })} onResume={jest.fn()} onSettle={onSettle} settling={false} />);

    expect(screen.getByText('Chess result not saved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith({ resign: false }));
  });
});

describe('SetupStartFooter', () => {
  const props = {
    label: 'Start Game',
    onResume: jest.fn(),
    settling: false,
  };

  it('starts straight away with nothing unfinished', () => {
    const onStart = jest.fn();
    render(<SetupStartFooter {...props} saved={null} onStart={onStart} onSettle={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Start Game' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('replaces a casual unfinished game without asking', () => {
    const onStart = jest.fn();
    render(<SetupStartFooter {...props} saved={game({ rated: false })} onStart={onStart} onSettle={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Start Game' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('will not start over a rated game until it is resumed or resigned', async () => {
    const onStart = jest.fn();
    const onSettle = jest.fn(async () => ({ kind: 'recorded' as const, rating: {} as never }));
    render(<SetupStartFooter {...props} saved={game()} onStart={onStart} onSettle={onSettle} />);

    fireEvent.press(screen.getByRole('button', { name: 'Start Game' }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('You have an unfinished rated chess game.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Resign and start' }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onSettle).toHaveBeenCalledWith({ resign: true });
  });

  it('does not start when the resignation could not be written', async () => {
    const onStart = jest.fn();
    const onSettle = jest.fn(async () => {
      throw new Error('offline');
    });
    render(<SetupStartFooter {...props} saved={game()} onStart={onStart} onSettle={onSettle} />);

    fireEvent.press(screen.getByRole('button', { name: 'Start Game' }));
    fireEvent.press(screen.getByRole('button', { name: 'Resign and start' }));
    expect(await screen.findByText(/Couldn't save the result/)).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('lets puzzles and matchmaking through, since they replace nothing', () => {
    const onStart = jest.fn();
    render(<SetupStartFooter {...props} saved={game()} onStart={onStart} onSettle={jest.fn()} leavesGame />);
    fireEvent.press(screen.getByRole('button', { name: 'Start Game' }));
    expect(onStart).toHaveBeenCalled();
  });
});
