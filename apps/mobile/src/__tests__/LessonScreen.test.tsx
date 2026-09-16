import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LESSONS, MOBILE_LESSON_PROGRESS_KEY } from '@gameexplorer/shared';
import type { LessonGame } from '@gameexplorer/shared';
import { LessonScreen } from '@/screens/LessonScreen';
import { SettingsProvider } from '@/providers/SettingsProvider';

// Renders shared primitives, which animate with reanimated.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/**
 * The coached loop on a phone, driven end to end: the real `useLesson`, the
 * real shared reducer, the real authored lessons, and real AsyncStorage (the
 * official in-memory mock). Only the four boards are doubled.
 *
 * They have to be, for exactly the reason `PuzzleScreen.test.tsx` gives: every
 * board is a `GestureDetector` over reanimated worklets that hit-test a touch
 * against a measured layout, and there is no layout under jest. Doubling them
 * at the module boundary keeps what this screen is responsible for — which
 * board, which props, what the coach says — inside the test.
 *
 * The point of the file is the one thing a lesson does that a puzzle does not:
 * **a wrong answer produces the sentence an author wrote, and no search runs.**
 */

const mockBoard: { move: string[]; props: Record<string, unknown> } = { move: [], props: {} };

function mockBoardModule(label: string, onMoveArgs: () => unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  function MockBoard(props: Record<string, unknown>) {
    mockBoard.props = props;
    const marks = (props.highlightSquares ?? []) as { square: string; kind: string }[];
    return React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress: () => (props.onMove as (...a: unknown[]) => void)(...onMoveArgs()),
      },
      React.createElement(Text, null, `interactive:${String(props.interactive)}`),
      React.createElement(Text, null, `marks:${marks.map((m) => `${m.kind}@${m.square}`).join(',')}`),
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
  ReversiBoard: mockBoardModule('reversi board', () => [mockBoard.move[0]]),
}));
jest.mock('@/board/GoBoard', () => ({
  GoBoard: mockBoardModule('go board', () => [mockBoard.move[0]]),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
}));

function renderLesson(game: LessonGame, lessonId: string) {
  render(
    <SettingsProvider>
      <LessonScreen game={game} lessonId={lessonId} />
    </SettingsProvider>,
  );
}

async function openLesson(game: LessonGame, lessonId: string) {
  renderLesson(game, lessonId);
  await waitFor(() => expect(screen.getByTestId('coach-say')).toBeOnTheScreen());
}

function play(label: string, ...move: string[]) {
  mockBoard.move = move;
  fireEvent.press(screen.getByLabelText(label));
}

const CHESS_L01 = LESSONS.chess.lessons[0];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockReplace.mockClear();
});

describe('LessonScreen', () => {
  it('opens on the first step with the coach already talking', async () => {
    await openLesson('chess', CHESS_L01.id);

    expect(screen.getByTestId('coach-say')).toHaveTextContent(CHESS_L01.steps[0].instruction);
    expect(screen.getByTestId('lesson-progress')).toHaveTextContent(
      `1 / ${CHESS_L01.steps.length}`,
    );
    // A read step has nothing to play, so the board is inert and Continue is
    // the action the bar offers.
    expect(screen.getByText('interactive:false')).toBeOnTheScreen();
    expect(screen.getByTestId('lesson-continue')).toBeOnTheScreen();
  });

  it('draws the step’s marks on the board', async () => {
    await openLesson('chess', CHESS_L01.id);
    const marks = CHESS_L01.steps[0].marks ?? [];
    expect(marks.length).toBeGreaterThan(0);
    expect(screen.getByText(/^marks:/)).toHaveTextContent(
      `marks:${marks.map((m) => `${m.kind}@${m.square}`).join(',')}`,
    );
  });

  it('advances a read step on Continue', async () => {
    await openLesson('chess', CHESS_L01.id);
    fireEvent.press(screen.getByTestId('lesson-continue'));

    await waitFor(() =>
      expect(screen.getByTestId('coach-say')).toHaveTextContent(CHESS_L01.steps[1].instruction),
    );
    // Now a move is owed, so the board wakes up.
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();
  });

  it('accepts a move that matches the step’s shape', async () => {
    await openLesson('chess', CHESS_L01.id);
    fireEvent.press(screen.getByTestId('lesson-continue'));
    await waitFor(() => expect(screen.getByText('interactive:true')).toBeOnTheScreen());

    play('chess board', 'e2', 'e4');

    await waitFor(() =>
      expect(screen.getByTestId('coach-say')).toHaveTextContent(CHESS_L01.steps[1].success!),
    );
  });

  it('answers a wrong move with the AUTHORED line, not a refutation', async () => {
    await openLesson('chess', CHESS_L01.id);
    fireEvent.press(screen.getByTestId('lesson-continue'));
    await waitFor(() => expect(screen.getByText('interactive:true')).toBeOnTheScreen());

    // A knight move on the "push a pawn" step. The lesson names this mistake.
    play('chess board', 'g1', 'f3');

    const authored = CHESS_L01.steps[1].misses!.find((m) => m.match?.piece === 'knight')!.say;
    await waitFor(() => expect(screen.getByTestId('coach-say')).toHaveTextContent(authored));

    // Still on the same step, and the board never moved on.
    expect(screen.getByTestId('lesson-progress')).toHaveTextContent(
      `2 / ${CHESS_L01.steps.length}`,
    );
    // The bar offers the retry as the primary action; the board is still live.
    expect(screen.getByTestId('lesson-retry')).toBeOnTheScreen();
    expect(screen.getByText('interactive:true')).toBeOnTheScreen();
  });

  it('lets the learner try again straight after a miss', async () => {
    await openLesson('chess', CHESS_L01.id);
    fireEvent.press(screen.getByTestId('lesson-continue'));
    await waitFor(() => expect(screen.getByText('interactive:true')).toBeOnTheScreen());

    play('chess board', 'g1', 'f3');
    await waitFor(() => expect(screen.getByTestId('coach-say')).toBeOnTheScreen());
    play('chess board', 'd2', 'd4');

    await waitFor(() =>
      expect(screen.getByTestId('coach-say')).toHaveTextContent(CHESS_L01.steps[1].success!),
    );
  });

  it('reports a lesson that does not exist instead of crashing', async () => {
    renderLesson('chess', 'chess-l99');
    await waitFor(() =>
      expect(screen.getByText(/renamed or removed|does not exist/)).toBeOnTheScreen(),
    );
  });

  it('banks completion, and the last step with it', async () => {
    // A two-step lesson would be quicker, but the point is the end of a real
    // one — so this walks `checkers-l03`, which is a read plus a single move.
    const lesson = LESSONS.checkers.lessons.find((l) => l.id === 'checkers-l03')!;
    expect(lesson.steps).toHaveLength(2);

    await openLesson('checkers', lesson.id);
    fireEvent.press(screen.getByTestId('lesson-continue'));
    await waitFor(() => expect(screen.getByText('interactive:true')).toBeOnTheScreen());

    play('checkers board', 'f2', 'f6');

    await waitFor(() => expect(screen.getByTestId('lesson-done')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-say')).toHaveTextContent(lesson.outro);

    const stored = JSON.parse((await AsyncStorage.getItem(MOBILE_LESSON_PROGRESS_KEY))!);
    expect(stored.completed).toContain(lesson.id);
    // The final step has to survive too: completion and the step count are
    // written by two effects in the same commit, and the second used to
    // overwrite the first from a stale snapshot.
    expect(stored.steps[lesson.id]).toBe(lesson.steps.length);
  });
});
