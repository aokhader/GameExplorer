import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SettingsProvider } from '@/providers/SettingsProvider';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import type { AnalysisAdapter } from '@/analysis/types';
import type { GradedMove } from '@/analysis/useGameAnalysis';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

// The eval bar animates its fill; nothing here has a native runtime to do it on.
// `require` rather than the imported helper: jest hoists mock factories above
// every import, so the binding wouldn't exist yet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const adapter: AnalysisAdapter<unknown> = {
  evaluate: jest.fn(),
  lastMove: () => null,
  currentTurn: () => 'white',
  formatScore: ({ score }) => `${score > 0 ? '+' : ''}${(score / 100).toFixed(2)}`,
  whiteShare: () => 0.62,
  thresholds: { inaccuracy: 50, mistake: 100, blunder: 200 },
  scanBudgetMs: 0,
  liveBudgetMs: 0,
};

const OPENING = ['e4', 'e5', 'Nf3'];

const EMPTY_COUNTS = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };

type Props = React.ComponentProps<typeof ReviewScreen<unknown>>;

/**
 * The screen reads reduced-motion through `useSettings`, and the provider
 * hydrates from AsyncStorage — so every render awaits the first paint to keep
 * that state update inside `act` (same pattern as the GameBar tests).
 */
async function renderReview(overrides: Partial<Props> = {}) {
  const props: Props = {
    accent: 'chess',
    title: 'Review',
    adapter,
    moves: OPENING,
    board: <Text>BOARD</Text>,
    viewIndex: 1,
    onSeek: jest.fn(),
    total: OPENING.length + 1,
    playerColor: 'white',
    evaluation: { score: 125, mate: null, bestMove: { from: 'g1', to: 'f3' }, terminal: false },
    grades: [null, null, null],
    summary: { white: { ...EMPTY_COUNTS }, black: { ...EMPTY_COUNTS } },
    scanning: false,
    progress: { done: 0, total: 0 },
    complete: false,
    liveBusy: false,
    error: null,
    onScan: jest.fn(),
    onStopScan: jest.fn(),
    onExit: jest.fn(),
    ...overrides,
  };
  render(
    <SettingsProvider>
      <ReviewScreen {...props} />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: 'Close review' });
  return props;
}

describe('ReviewScreen — the position on screen', () => {
  it('shows the eval and what the engine would play', async () => {
    await renderReview();
    expect(screen.getByText('+1.25')).toBeOnTheScreen();
    expect(screen.getByText('g1→f3')).toBeOnTheScreen();
    expect(screen.getByText('AFTER MOVE 1')).toBeOnTheScreen();
  });

  it('names the starting position rather than "after move 0"', async () => {
    await renderReview({ viewIndex: 0 });
    expect(screen.getByText('STARTING POSITION')).toBeOnTheScreen();
  });

  it('collapses a placement game move to the single square', async () => {
    await renderReview({
      evaluation: { score: 0, mate: null, bestMove: { from: 'd3', to: 'd3' }, terminal: false },
    });
    expect(screen.getByText('d3')).toBeOnTheScreen();
  });

  it('grades the move that produced this position, and names the better one', async () => {
    const grades: (GradedMove | null)[] = [
      { grade: 'blunder', loss: 320, better: { from: 'd2', to: 'd4' } },
      null,
      null,
    ];
    await renderReview({ viewIndex: 1, grades });

    expect(screen.getByText(/Blunder/)).toBeOnTheScreen();
    expect(screen.getByText('d2→d4')).toBeOnTheScreen();
  });

  it('says nothing about a best move that has no better alternative', async () => {
    const grades: (GradedMove | null)[] = [{ grade: 'best', loss: 0, better: null }, null, null];
    await renderReview({ viewIndex: 1, grades });

    expect(screen.getByText(/Best move/)).toBeOnTheScreen();
    expect(screen.queryByText(/Better was/)).toBeNull();
  });
});

describe('ReviewScreen — scanning', () => {
  it('offers the scan before it has run', async () => {
    const props = await renderReview();
    fireEvent.press(screen.getByRole('button', { name: 'Review every move' }));
    expect(props.onScan).toHaveBeenCalledTimes(1);
  });

  it('reports progress and can be stopped', async () => {
    const props = await renderReview({ scanning: true, progress: { done: 7, total: 20 } });
    expect(screen.getByText(/7 of 20 positions/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(props.onStopScan).toHaveBeenCalledTimes(1);
    // The scan button is gone while one is running.
    expect(screen.queryByRole('button', { name: 'Review every move' })).toBeNull();
  });

  it('shows a you-versus-bot tally once complete', async () => {
    await renderReview({
      complete: true,
      summary: {
        white: { ...EMPTY_COUNTS, blunder: 2, best: 5 },
        black: { ...EMPTY_COUNTS, mistake: 1 },
      },
    });

    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getByText('Bot')).toBeOnTheScreen();
    expect(screen.getByLabelText('2 Blunder')).toBeOnTheScreen();
    expect(screen.getByLabelText('5 Best move')).toBeOnTheScreen();
  });

  it('names both colours in pass-and-play, where there is no "you"', async () => {
    await renderReview({ complete: true, showBothSides: true });
    expect(screen.getByText('White')).toBeOnTheScreen();
    expect(screen.getByText('Black')).toBeOnTheScreen();
    expect(screen.queryByText('You')).toBeNull();
  });

  it('surfaces an engine failure', async () => {
    await renderReview({ error: 'Engine not ready' });
    expect(screen.getByText('Engine not ready')).toBeOnTheScreen();
  });
});

describe('ReviewScreen — stepping', () => {
  it('steps and jumps to either end', async () => {
    const props = await renderReview({ viewIndex: 2 });

    fireEvent.press(screen.getByRole('button', { name: 'Previous move' }));
    expect(props.onSeek).toHaveBeenLastCalledWith(1);

    fireEvent.press(screen.getByRole('button', { name: 'Next move' }));
    expect(props.onSeek).toHaveBeenLastCalledWith(3);

    fireEvent.press(screen.getByRole('button', { name: 'First move' }));
    expect(props.onSeek).toHaveBeenLastCalledWith(0);

    fireEvent.press(screen.getByRole('button', { name: 'Last move' }));
    expect(props.onSeek).toHaveBeenLastCalledWith(3);
  });

  it('disables the ends it is already on', async () => {
    await renderReview({ viewIndex: 0 });
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'First move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled();
  });

  it('leaves review when done', async () => {
    const props = await renderReview();
    fireEvent.press(screen.getByRole('button', { name: 'Close review' }));
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });
});
