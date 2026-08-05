import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MOBILE_PUZZLE_PROGRESS_KEY } from '@gameexplorer/shared';
import { PuzzleScreen } from '@/screens/PuzzleScreen';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The solve loop on a phone, driven end to end: the real `usePuzzle`, the real
 * shared reducer, the real authored puzzles, and real AsyncStorage (the official
 * in-memory mock). Only the three boards are doubled.
 *
 * They have to be. Every board is a `GestureDetector` over reanimated worklets
 * that hit-test a touch against a measured layout — there is no layout under
 * jest, so a tap has no square to land on, and this repo already draws that line
 * (see jest.config.js: gesture flows belong to the Maestro flows). Doubling them
 * at the module boundary keeps the parts this screen is responsible for — which
 * board, which props, what a move means for each game — inside the test, and it
 * is the same boundary `PuzzleBoard` was written to.
 */

/** The move the next board press will report. Set by each test before pressing. */
const mockBoard: { move: string[]; props: Record<string, unknown> } = { move: [], props: {} };

/** Shared body for the three doubles — records props, presses report a move. */
function mockBoardModule(label: string, onMoveArgs: () => unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  function MockBoard(props: Record<string, unknown>) {
    mockBoard.props = props;
    const hint = props.hintMove ?? props.hintPos ?? null;
    return React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress: () => (props.onMove as (...a: unknown[]) => void)(...onMoveArgs()),
      },
      React.createElement(Text, null, `interactive:${String(props.interactive)}`),
      React.createElement(Text, null, `hint:${hint ? JSON.stringify(hint) : 'none'}`),
    );
  }
  return MockBoard;
}

jest.mock('@/board/ChessBoard', () => ({
  ChessBoard: mockBoardModule('chess board', () => [mockBoard.move[0], mockBoard.move[1], undefined]),
}));
jest.mock('@/board/CheckersBoard', () => ({
  CheckersBoard: mockBoardModule('checkers board', () => [mockBoard.move[0], mockBoard.move[1]]),
}));
jest.mock('@/board/ReversiBoard', () => ({
  // Reversi reports one square, not a pair — the difference `PuzzleBoard` folds
  // away, and the reason this double can't be shared verbatim with the others.
  ReversiBoard: mockBoardModule('reversi board', () => [mockBoard.move[0]]),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

/** Play `move` on the board and wait for the screen to settle. */
async function play(label: string, ...move: string[]) {
  mockBoard.move = move;
  fireEvent.press(screen.getByLabelText(label));
}

/**
 * The bar reads the haptics setting through `useGameSfx`, so the screen needs
 * the settings provider — `app/_layout.tsx` wraps the whole app in one.
 */
function renderScreen(game: 'chess' | 'checkers' | 'reversi') {
  render(
    <SettingsProvider>
      <PuzzleScreen game={game} />
    </SettingsProvider>,
  );
}

async function openPuzzles(game: 'chess' | 'checkers' | 'reversi') {
  renderScreen(game);
  await waitFor(() => expect(screen.getByTestId('puzzle-prompt')).toBeOnTheScreen());
}

async function storedProgress() {
  const raw = await AsyncStorage.getItem(MOBILE_PUZZLE_PROGRESS_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockBoard.move = [];
  mockBoard.props = {};
});

describe('PuzzleScreen', () => {
  it('opens on the first unsolved puzzle with progress at zero', async () => {
    await openPuzzles('chess');

    expect(screen.getByTestId('puzzle-prompt')).toHaveTextContent(/mate in one/);
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/0 \/ 2/);
    expect(screen.getByText('Your move')).toBeOnTheScreen();
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();
  });

  it('refuses a wrong move, goes inert, and comes back on Try again', async () => {
    await openPuzzles('chess');

    // Kg1–f1 is legal chess and not the solution.
    await play('chess board', 'g1', 'f1');
    await waitFor(() => expect(screen.getByText('Not quite')).toBeOnTheScreen());
    // The board stops taking input until the player asks for another go —
    // otherwise a phone-sized board silently swallows taps.
    expect(screen.getByText('interactive:false')).toBeOnTheScreen();

    // Kf1 does not lose anything — it just isn't mate. Saying "and Black
    // answers…" here would be inventing a punish that doesn't exist.
    await waitFor(() =>
      expect(screen.getByText('g1→f1 is playable, but it does not force mate.')).toBeOnTheScreen(),
    );

    // The button renames itself after a miss, label included — a screen reader
    // gets the same nudge as the eye.
    expect(screen.queryByLabelText('Retry')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try again'));
    await waitFor(() => expect(screen.getByText('Your move')).toBeOnTheScreen());
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();
    // A miss is not a solve.
    expect(await storedProgress()).toMatchObject({ solved: [] });
  });

  it('plays the opponent’s refutation out on the board and names it', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({ v: 1, solved: ['chess-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    );
    await openPuzzles('chess');

    // Rb1–a1 hangs the rook to the a8 rook. That IS a refutation, unlike the
    // king step above, and the difference has to reach the player in words.
    await play('chess board', 'b1', 'a1');
    await waitFor(() =>
      expect(
        screen.getByText('After b1→a1, Black answers a8→a1 and you are worse.'),
      ).toBeOnTheScreen(),
    );
    // The board has run two plies past the line to show it happening.
    expect(screen.getByLabelText('Previous position')).toBeEnabled();
  });

  it('steps back through the refutation and refuses input off the live position', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({ v: 1, solved: ['chess-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    );
    await openPuzzles('chess');

    await play('chess board', 'b1', 'a1');
    await waitFor(() => expect(screen.getByLabelText('Previous position')).toBeEnabled());

    // Walk back to the position that was misplayed — the whole reason the nav
    // controls are on this bar.
    fireEvent.press(screen.getByLabelText('Previous position'));
    fireEvent.press(screen.getByLabelText('Previous position'));
    await waitFor(() => expect(screen.getByLabelText('Previous position')).toBeDisabled());
    expect(screen.getByText('interactive:false')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Next position'));
    await waitFor(() => expect(screen.getByLabelText('Previous position')).toBeEnabled());
  });

  it('banks a clean solve to storage', async () => {
    await openPuzzles('chess');

    await play('chess board', 'a1', 'a8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());

    expect(screen.getByTestId('puzzle-explanation')).toHaveTextContent(/back rank/);
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/1 \/ 2/);
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/streak 1/);
    await waitFor(async () =>
      expect(await storedProgress()).toMatchObject({ solved: ['chess-001'], streak: 1 }),
    );
  });

  it('plays the scripted reply and finishes a two-move line', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({ v: 1, solved: ['chess-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    );
    await openPuzzles('chess');
    expect(screen.getByTestId('puzzle-prompt')).toHaveTextContent(/mate in two/);

    await play('chess board', 'b2', 'b8');
    await waitFor(() => expect(screen.getByText('Correct')).toBeOnTheScreen());

    // Black's only answer, played for the player after the beat.
    await waitFor(() => expect(screen.getByText('Your move')).toBeOnTheScreen(), { timeout: 3000 });

    await play('chess board', 'b1', 'b8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());
  });

  it('spells the hint out and drops the streak', async () => {
    await openPuzzles('chess');

    fireEvent.press(screen.getByLabelText('Hint'));
    // Rings on the board are no use to a screen reader, so the move is written
    // out as well.
    await waitFor(() => expect(screen.getByText('Play a1 → a8')).toBeOnTheScreen());
    expect(screen.getByText('hint:{"from":"a1","to":"a8"}')).toBeOnTheScreen();

    await play('chess board', 'a1', 'a8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());

    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/1 \/ 2/);
    // Counted as solved, but a hinted solve is not a clean one.
    expect(screen.getByTestId('puzzle-progress')).not.toHaveTextContent(/streak/);
  });

  it('passes a checkers multi-jump through as its first and last square', async () => {
    await openPuzzles('checkers');

    // e2–g4–e6–c8 is a triple jump ending in a crowning; the board reports only
    // where the piece was picked up and put down.
    await play('checkers board', 'e2', 'c8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/1 \/ 2/);
  });

  it('refuses the checkers decoy', async () => {
    await openPuzzles('checkers');

    // c2–e4–g6 is legal, and a double capture — just not the best one.
    await play('checkers board', 'c2', 'g6');
    await waitFor(() => expect(screen.getByText('Not quite')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/0 \/ 2/);
  });

  /**
   * The one line where "no scripted reply" does not mean "solved": after h8
   * White has no legal move, the runtime passes for them, and Black is on the
   * clock again. A regression here would end the puzzle a move early.
   */
  it('hands the move straight back after the opponent’s forced pass', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({ v: 1, solved: ['reversi-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    );
    await openPuzzles('reversi');
    expect(screen.getByTestId('puzzle-prompt')).toHaveTextContent(/Win the game/);

    await play('reversi board', 'h1');
    await waitFor(() => expect(screen.getByText('Correct')).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByText('Your move')).toBeOnTheScreen(), { timeout: 3000 });

    await play('reversi board', 'h8');
    // Not 'replying', not 'solved' — Black moves again.
    await waitFor(() => expect(screen.getByText('Your move')).toBeOnTheScreen());
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();

    await play('reversi board', 'a1');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/2 \/ 2/);
  });

  it('offers a restart once every puzzle is solved', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        solved: ['chess-001', 'chess-002'],
        streak: 2,
        bestStreak: 2,
        lastSeen: {},
        updatedAt: '',
      }),
    );
    renderScreen('chess');

    await waitFor(() =>
      expect(screen.getByText("You've solved every Chess puzzle")).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Start over'));
    await waitFor(() => expect(screen.getByTestId('puzzle-prompt')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/0 \/ 2/);
  });
});
