import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GoScreen } from '@/screens/GoScreen';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The Go screen end to end on a phone: the real shared `useLocalGame` loop, the
 * real engine, and the real adapter. Only the board is doubled — it is a
 * `GestureDetector` over reanimated worklets that hit-tests a touch against a
 * measured layout, and there is no layout under jest (the same line every board
 * test in this repo draws; gesture flows belong to the Maestro flows).
 *
 * What that leaves inside the test is exactly what this screen is responsible
 * for: which mode configures what, that a placement reaches the engine, and —
 * the one thing Go has that no other game here does — that **passing is a move**
 * and two of them end the game and score the board.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/** The point the next board press reports. */
const mockBoard: { move: string; props: Record<string, unknown> } = { move: 'e5', props: {} };

/**
 * Declared out here and named `mock*` on purpose. A component written inline in
 * the `jest.mock` factory trips the out-of-scope guard: nativewind's babel
 * transform hoists a `_ReactNativeCSSInterop` helper to module scope, and the
 * factory would then be closing over it. Same shape as `PuzzleScreen.test.tsx`.
 */
function mockGoBoardModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  function MockGoBoard(props: Record<string, unknown>) {
    mockBoard.props = props;
    return React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: 'go board',
        onPress: () => (props.onMove as (p: string) => void)(mockBoard.move),
      },
      React.createElement(Text, null, `interactive:${String(props.interactive)}`),
      React.createElement(Text, null, `hint:${props.hintPos ?? 'none'}`),
    );
  }
  return MockGoBoard;
}

jest.mock('@/board/GoBoard', () => ({ GoBoard: mockGoBoardModule() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

// `useIsOnline` subscribes to expo-network, whose native listener has no
// `remove` under Jest. Report connected — the offline path is `useIsOnline`'s
// own test, not this screen's.
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));

// Signed out: no rating reads, no saves — the guest path, which is also the one
// pass-and-play always takes.
jest.mock('@finesse/client', () => ({ useAuth: () => ({ user: null, loading: false }) }));

// The adapter imports the db writers at module load, and the db barrel builds a
// Supabase client on import. No test here signs in or reaches a rated save, so
// stub them rather than dragging Supabase config into Jest — the same call
// `useLocalGame.test.ts` makes.
jest.mock('@finesse/db', () => ({
  saveGoGame: jest.fn(async () => null),
  getUserRating: jest.fn(async () => null),
  upsertUserRating: jest.fn(async () => null),
}));

function renderScreen() {
  return render(
    <SettingsProvider>
      <GoScreen />
    </SettingsProvider>,
  );
}

/** Walk the setup screen into a started game in the given mode. */
async function startGame(mode: 'vs Bot' | 'Pass & Play') {
  renderScreen();
  fireEvent.press(screen.getByRole('button', { name: new RegExp(mode) }));
  fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));
  await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
}

describe('GoScreen — setup', () => {
  it('offers only the modes Go supports', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /vs Bot/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Training/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pass & Play/ })).toBeTruthy();
    // No online (no socket protocol for Go) and no puzzles (no forcing gate).
    expect(screen.queryByRole('button', { name: /Online/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Puzzles/ })).toBeNull();
  });

  it('states the ruleset the player is agreeing to', () => {
    renderScreen();
    expect(screen.getByText(/9×9 · area scoring · 7\.5 komi to white/)).toBeTruthy();
  });

  it('blocks training for a guest, since training is always rated', () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /Training/ }));
    expect(screen.getByRole('button', { name: /Start Rated Game/ })).toBeDisabled();
  });
});

describe('GoScreen — playing', () => {
  it('places a stone through the engine and hands the turn over', async () => {
    await startGame('Pass & Play');
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));

    // The move ribbon prints Go coordinates, where the file letters skip I.
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());
  });

  it('rejects an occupied point rather than stacking stones', async () => {
    await startGame('Pass & Play');
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());

    // Same point again — the engine refuses, so no second entry appears.
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getAllByText('E5')).toHaveLength(1));
  });

  it('treats a pass as a move, and ends the game on the second one', async () => {
    await startGame('Pass & Play');

    // Held across both presses on purpose: once the first pass lands, the move
    // ribbon carries its own pressable "Pass" chip, so re-querying by name
    // would be ambiguous. The bar button never unmounts.
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    await waitFor(() => expect(screen.getByText('Pass')).toBeTruthy());

    fireEvent.press(pass);

    // An empty board is all neutral, so white takes it on komi alone — and the
    // result has to be stated in points, not just as a winner.
    await waitFor(() => expect(screen.getByText(/Two passes — White by 7\.5/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Black 0, White 7\.5/)).toBeTruthy());
  });

  it('makes the board inert once the game is over', async () => {
    await startGame('Pass & Play');
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    fireEvent.press(pass);

    await waitFor(() => expect(screen.getByText('interactive:false')).toBeTruthy());
  });
});
