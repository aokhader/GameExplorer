import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MOBILE_PUZZLE_PROGRESS_KEY, staticPuzzleSource } from '@gameexplorer/shared';
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

// The screen celebrates a solve with `Confetti`, which imports reanimated
// directly. Safe to flatten here precisely because the three boards below are
// doubled — nothing left in this tree is a `GestureDetector` reaching into
// reanimated's real internals, which is what the opt-in rule exists to protect.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

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

/**
 * Seed progress so the screen opens on one specific puzzle.
 *
 * The screen always serves the first unsolved puzzle in progression order, so
 * pinning one means marking everything before it solved. The order comes from
 * the shipped source rather than a hand-written list of ids, because content
 * gets added — and a test that assumes "chess-001 is first" quietly starts
 * testing a different position the day it isn't.
 */
async function seedUpTo(game: 'chess' | 'checkers' | 'reversi', id?: string) {
  const ordered = await staticPuzzleSource.listPuzzles({ game });
  const index = id ? ordered.findIndex((p) => p.id === id) : 0;
  expect(index).toBeGreaterThanOrEqual(0);

  const solved = ordered.slice(0, index).map((p) => p.id);
  await AsyncStorage.setItem(
    MOBILE_PUZZLE_PROGRESS_KEY,
    JSON.stringify({ v: 1, solved, streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
  );
  return { ordered, solved, total: ordered.length };
}

/** "3 / 20" as a matcher, so a test never hard-codes how much content ships. */
function progressText(solved: number, total: number) {
  return new RegExp(`${solved} / ${total}`);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockBoard.move = [];
  mockBoard.props = {};
});

describe('PuzzleScreen', () => {
  it('opens on the first unsolved puzzle with progress at zero', async () => {
    const { total } = await seedUpTo('chess');
    await openPuzzles('chess');

    expect(screen.getByTestId('puzzle-prompt')).toHaveTextContent(/mate in one/);
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(progressText(0, total));
    expect(screen.getByText('Your move')).toBeOnTheScreen();
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();
  });

  it('refuses a wrong move, goes inert, and comes back on Try again', async () => {
    await seedUpTo('chess', 'chess-003');
    await openPuzzles('chess');

    // Qb1–b7 is a legal queen move and not the mate.
    await play('chess board', 'b1', 'b7');
    await waitFor(() => expect(screen.getByText('Not quite')).toBeOnTheScreen());
    // The board stops taking input until the player asks for another go —
    // otherwise a phone-sized board silently swallows taps.
    expect(screen.getByText('interactive:false')).toBeOnTheScreen();

    // Qb7 does not lose anything — it just isn't mate. Saying "and Black
    // answers…" here would be inventing a punish that doesn't exist.
    await waitFor(() =>
      expect(screen.getByText('b1→b7 is playable, but it does not force mate.')).toBeOnTheScreen(),
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
    // A position with a black queen in it, so a wrong move can be punished
    // rather than merely miss the point.
    await seedUpTo('chess', 'chess-007');
    await openPuzzles('chess');

    // Rd1–d7 hangs the rook to the queen it was meant to capture. That IS a
    // refutation, unlike the quiet move above, and the difference has to reach
    // the player in words.
    await play('chess board', 'd1', 'd7');
    await waitFor(() =>
      expect(
        screen.getByText('After d1→d7, Black answers d8→d7 and you are worse.'),
      ).toBeOnTheScreen(),
    );
    // The board has run two plies past the line to show it happening.
    expect(screen.getByLabelText('Previous position')).toBeEnabled();
  });

  it('steps back through the refutation and refuses input off the live position', async () => {
    await seedUpTo('chess', 'chess-007');
    await openPuzzles('chess');

    await play('chess board', 'd1', 'd7');
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
    const { total } = await seedUpTo('chess', 'chess-003');
    await openPuzzles('chess');

    await play('chess board', 'b1', 'b8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());

    expect(screen.getByTestId('puzzle-explanation')).toHaveTextContent(/Qb8 is mate/);
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(progressText(1, total));
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(/streak 1/);
    await waitFor(async () =>
      expect(await storedProgress()).toMatchObject({ solved: ['chess-003'], streak: 1 }),
    );
  });

  it('plays the scripted reply and finishes a two-move line', async () => {
    await seedUpTo('chess', 'chess-002');
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
    const { total } = await seedUpTo('chess', 'chess-003');
    await openPuzzles('chess');

    fireEvent.press(screen.getByLabelText('Hint'));
    // Rings on the board are no use to a screen reader, so the move is written
    // out as well.
    await waitFor(() => expect(screen.getByText('Play b1 → b8')).toBeOnTheScreen());
    expect(screen.getByText('hint:{"from":"b1","to":"b8"}')).toBeOnTheScreen();

    await play('chess board', 'b1', 'b8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());

    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(progressText(1, total));
    // Counted as solved, but a hinted solve is not a clean one.
    expect(screen.getByTestId('puzzle-progress')).not.toHaveTextContent(/streak/);
  });

  it('passes a checkers multi-jump through as its first and last square', async () => {
    const { solved, total } = await seedUpTo('checkers', 'checkers-001');
    await openPuzzles('checkers');

    // e2–g4–e6–c8 is a triple jump ending in a crowning; the board reports only
    // where the piece was picked up and put down.
    await play('checkers board', 'e2', 'c8');
    await waitFor(() => expect(screen.getByText('Solved')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(
      progressText(solved.length + 1, total),
    );
  });

  it('refuses the checkers decoy', async () => {
    const { solved, total } = await seedUpTo('checkers', 'checkers-001');
    await openPuzzles('checkers');

    // c2–e4–g6 is legal, and a double capture — just not the best one.
    await play('checkers board', 'c2', 'g6');
    await waitFor(() => expect(screen.getByText('Not quite')).toBeOnTheScreen());
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(
      progressText(solved.length, total),
    );
  });

  /**
   * The one line where "no scripted reply" does not mean "solved": after h8
   * White has no legal move, the runtime passes for them, and Black is on the
   * clock again. A regression here would end the puzzle a move early.
   */
  it('hands the move straight back after the opponent’s forced pass', async () => {
    const { solved, total } = await seedUpTo('reversi', 'reversi-002');
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
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(
      progressText(solved.length + 1, total),
    );
  });

  it('offers a restart once every puzzle is solved', async () => {
    const all = await staticPuzzleSource.listPuzzles({ game: 'chess' });
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        solved: all.map((p) => p.id),
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
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent(progressText(0, all.length));
  });
});
