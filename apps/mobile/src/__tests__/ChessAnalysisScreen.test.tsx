import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ChessAnalysisScreen from '../../app/analysis/chess';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The chess analysis screen's position editor, and what a drag does to it.
 *
 * In edit mode a drag relocates a piece — any colour, any square, no rules —
 * and in analyse mode it is a move again. The board is doubled: a drag needs a
 * laid-out board, which Jest has not got (see jest.config.js), and the gesture
 * half was verified on the device. What the double pins is the contract between
 * the two: which editing channels the screen hands the board in which mode, and
 * what the screen does with a drop.
 */

// Safe to flatten: the board, the one GestureDetector here, is doubled below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

// Edit mode never starts the engine; analyse mode only needs it to be absent.
jest.mock('@/engine/useEngineNative', () => ({
  useEngineNative: () => ({ isReady: false, isAvailable: false }),
}));

/** The props the screen last rendered the board with. */
const mockBoard: { props: Record<string, unknown> } = { props: {} };
jest.mock('@/board/ChessBoard', () => ({
  ChessBoard: (props: Record<string, unknown>) => {
    mockBoard.props = props;
    return null;
  },
}));

const renderScreen = () =>
  render(
    <SettingsProvider>
      <ChessAnalysisScreen />
    </SettingsProvider>,
  );

/** The placement field of the FEN box — the part an edit changes. */
const placement = () => String(screen.getByLabelText('FEN').props.value).split(' ')[0];

const drop = (from: string, to: string) =>
  act(() => (mockBoard.props.onPieceRelocate as (f: string, t: string) => void)(from, to));

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

describe('ChessAnalysisScreen — editing by drag', () => {
  it('hands the board both editing channels in edit mode', () => {
    renderScreen();
    expect(mockBoard.props.onSquarePress).toEqual(expect.any(Function));
    expect(mockBoard.props.onPieceRelocate).toEqual(expect.any(Function));
  });

  it('moves a dropped piece with no rules — not a legal move, and not the side to move', () => {
    renderScreen();
    drop('e2', 'e5');
    expect(placement()).toBe('rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR');
    // Black's knight, with White to move.
    drop('g8', 'f6');
    expect(placement()).toBe('rnbqkb1r/pppppppp/5n2/4P3/8/8/PPPP1PPP/RNBQKBNR');
  });

  it('replaces whatever stands on the square, whatever tool is picked', () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Eraser' }));
    drop('d1', 'd7');
    expect(placement()).toBe('rnbqkbnr/pppQpppp/8/8/8/8/PPPPPPPP/RNB1KBNR');
  });

  it('ignores a drop from an empty square', () => {
    renderScreen();
    drop('e4', 'e5');
    expect(placement()).toBe(START);
  });

  it('takes both editing channels away in analyse mode, so a drag is a move again', () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Analyse position' }));
    expect(mockBoard.props.onSquarePress).toBeUndefined();
    expect(mockBoard.props.onPieceRelocate).toBeUndefined();
    expect(mockBoard.props.interactive).toBe(true);
  });
});
