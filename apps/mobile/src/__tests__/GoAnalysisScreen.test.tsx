import { fireEvent, render, screen } from '@testing-library/react-native';
import GoAnalysisScreen from '../../app/analysis/go';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * Go's analysis screen — the SGF box that answers chess's FEN box.
 *
 * What is worth pinning is the **refusal** path. A parser that guesses produces
 * a plausible, wrong game: assume 9×9 for a file with no `SZ` and a 19×19 game
 * imports as a truncated 9×9 one, with no error anywhere and a board that looks
 * entirely reasonable. So every rejection is asserted, and each one has to say
 * what was wrong rather than just refusing.
 *
 * The review side is deliberately not exercised here: `useGameAnalysis` runs a
 * real MCTS scan, and `BoardFrame` never lays out under Jest. That half is
 * covered against the engine in `packages/shared/src/analysis/goAdapter.test.ts`
 * and was verified on the device.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

const VALID = '(;FF[4]GM[1]SZ[19]KM[6.5]RU[Japanese];B[pd];W[dp];B[qp];W[dd])';

/** The board reads live theme + coordinate settings once a game loads. */
const renderScreen = () =>
  render(
    <SettingsProvider>
      <GoAnalysisScreen />
    </SettingsProvider>,
  );

function paste(text: string) {
  fireEvent.changeText(screen.getByLabelText('SGF'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Analyse game' }));
}

describe('GoAnalysisScreen', () => {
  beforeEach(() => mockBack.mockClear());

  it('explains what it wants before anything is pasted', () => {
    renderScreen();
    expect(screen.getByText('Go analysis')).toBeOnTheScreen();
    // Naming the programs is the point: "SGF" alone tells a player nothing
    // about where they would get one.
    expect(screen.getByText(/OGS, Sabaki/)).toBeOnTheScreen();
  });

  it('cannot be submitted empty', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Analyse game' })).toBeDisabled();
  });

  it('refuses a file with no board size, rather than assuming one', () => {
    renderScreen();
    paste('(;FF[4]GM[1];B[pd])');
    expect(screen.getByText(/no board size/)).toBeOnTheScreen();
  });

  it('refuses a game that is not Go', () => {
    renderScreen();
    paste('(;FF[4]GM[2]SZ[8])');
    expect(screen.getByText(/Not a Go game/)).toBeOnTheScreen();
  });

  it('refuses something that is not SGF at all', () => {
    renderScreen();
    paste('just some text');
    expect(screen.getByText(/Not an SGF file/)).toBeOnTheScreen();
  });

  it('refuses a valid file that has no moves to review', () => {
    // Parses cleanly and is still useless: review grades moves, and there are
    // none. Saying so beats an empty review screen.
    renderScreen();
    paste('(;FF[4]GM[1]SZ[19]KM[6.5])');
    expect(screen.getByText(/no moves to review/)).toBeOnTheScreen();
  });

  it('leaves the input stage once a real game parses', () => {
    renderScreen();
    paste(VALID);
    // The paste box is gone, which is the only claim this test can make without
    // laying out a board.
    expect(screen.queryByLabelText('SGF')).toBeNull();
    expect(screen.queryByText(/Could not read/)).toBeNull();
  });

  it('goes back rather than stranding the player', () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalled();
  });
});
