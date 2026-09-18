import AsyncStorage from '@react-native-async-storage/async-storage';
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
 * the two things Go has that no other game here does — that **passing is a
 * move**, and that two of them open a **dead-stone review** rather than ending
 * the game. That second one is also the only place `useLocalGame`'s new
 * `isAwaitingReview` guards actually run, so this is where they are covered.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/** The point the next board press reports. */
const mockBoard: { move: string; props: Record<string, unknown> } = { move: 'e5', props: {} };

/**
 * Declared out here and named `mock*` on purpose: a `jest.mock` factory may only
 * close over variables whose names start with `mock`. It was first forced by
 * NativeWind's JSX transform, which hoisted a helper the inline component closed
 * over; NativeWind is gone, and the shape stays because it is the safe one. Same
 * shape as `PuzzleScreen.test.tsx`.
 */
function mockGoBoardModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  function MockGoBoard(props: Record<string, unknown>) {
    mockBoard.props = props;
    const dead = (props.deadStones as string[] | undefined) ?? [];
    return React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: 'go board',
        onPress: () =>
          props.onMarkToggle
            ? (props.onMarkToggle as (p: string) => void)(mockBoard.move)
            : (props.onMove as (p: string) => void)(mockBoard.move),
      },
      React.createElement(Text, null, `interactive:${String(props.interactive)}`),
      React.createElement(Text, null, `hint:${props.hintPos ?? 'none'}`),
      React.createElement(Text, null, `dead:${dead.length}`),
      React.createElement(Text, null, `markable:${String(!!props.onMarkToggle)}`),
    );
  }
  return MockGoBoard;
}

jest.mock('@/board/GoBoard', () => ({ GoBoard: mockGoBoardModule() }));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useFocusEffect: (cb: () => void) => cb(),
  useLocalSearchParams: () => mockParams,
}));

// `useIsOnline` subscribes to expo-network, whose native listener has no
// `remove` under Jest. Report connected — the offline path is `useIsOnline`'s
// own test, not this screen's.
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));

// Signed out: no rating reads, no saves — the guest path, which is also the one
// pass-and-play always takes.
jest.mock('@gameexplorer/client', () => ({ useAuth: () => ({ user: null, loading: false }) }));

// The adapter imports the db writers at module load, and the db barrel builds a
// Supabase client on import. No test here signs in or reaches a rated save, so
// stub them rather than dragging Supabase config into Jest — the same call
// `useLocalGame.test.ts` makes.
jest.mock('@gameexplorer/db', () => ({
  saveGoGame: jest.fn(async () => null),
  getUserRating: jest.fn(async () => null),
  upsertUserRating: jest.fn(async () => null),
}));

/**
 * The form renders once the remembered setup has been read — a frame late under
 * AsyncStorage — so every render waits for the mode picker to appear.
 */
async function renderScreen() {
  const view = render(
    <SettingsProvider>
      <GoScreen />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: /vs Bot/ });
  return view;
}

/**
 * Close the screen and open it again, as leaving and coming back would. The
 * same root re-renders a new GoScreen under a fresh key: unmounting one root
 * and rendering a second in the same test leaves the first root's async work
 * running past the test, and cleanup never settles.
 */
async function reopen(view: ReturnType<typeof render>, extra?: Record<string, string>) {
  if (extra) mockParams = extra;
  reopenKey += 1;
  view.rerender(
    <SettingsProvider>
      <GoScreen key={reopenKey} />
    </SettingsProvider>,
  );
}
let reopenKey = 0;

// Setups and unfinished games persist, so each test starts from an empty device.
beforeEach(async () => {
  mockParams = {};
  mockPush.mockClear();
  await AsyncStorage.clear();
});

/** Walk the setup screen into a started game in the given mode. */
async function startGame(mode: 'vs Bot' | 'Pass & Play') {
  await renderScreen();
  fireEvent.press(screen.getByRole('button', { name: new RegExp(mode) }));
  fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));
  await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
}

describe('GoScreen — setup', () => {
  it('offers only the modes Go supports', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: /vs Bot/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Training/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pass & Play/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Puzzles/ })).toBeTruthy();
    // Still no online: the socket protocol seats two known game types and Go
    // is not one of them.
    expect(screen.queryByRole('button', { name: /Online/ })).toBeNull();
  });

  it('sends the puzzles mode to its own route rather than setting up a game', async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /Puzzles/ }));

    // The rules card belongs to a game about to be played; puzzles have none.
    expect(screen.queryByRole('button', { name: /^Komi 7\.5/ })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: /Start Puzzles/ }));
    expect(mockPush).toHaveBeenCalledWith('/puzzles/go');
  });

  it('states the ruleset the player is agreeing to', async () => {
    await renderScreen();
    expect(screen.getByText(/9×9 · area scoring · 7\.5 komi to white/)).toBeTruthy();
  });

  it('restates the ruleset when either rule is changed', async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Territory scoring/ }));
    expect(screen.getByText(/9×9 · territory scoring · 7\.5 komi to white/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    expect(screen.getByText(/9×9 · territory scoring · no komi/)).toBeTruthy();
  });

  it('starts the game under the rules that were on screen, not the defaults', async () => {
    // The bug this pins: `useLocalGame` builds its first position in a
    // `useState` initializer, which runs once. The setup screen and the board
    // are the same component, so a ruleset chosen after mount used to be
    // discarded and the game began under area scoring at 7.5 komi regardless.
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Territory scoring/ }));
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));

    await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
    // The info card title-cases in CSS, so the text node itself is lowercase.
    expect(screen.getByText('territory')).toBeTruthy();
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('takes the rated toggle away at a komi the bot was never measured at', async () => {
    await renderScreen();
    expect(screen.getByLabelText('Rated')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Komi 5\.5/ }));
    expect(screen.queryByLabelText('Rated')).toBeNull();
    expect(screen.getByText(/casual/)).toBeTruthy();
  });

  it('blocks training for a guest, since training is always rated', async () => {
    await renderScreen();
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

  it('treats a pass as a move, and opens the review on the second one', async () => {
    await startGame('Pass & Play');

    // Held across both presses on purpose: once the first pass lands, the move
    // ribbon carries its own pressable "Pass" chip, so re-querying by name
    // would be ambiguous. The bar button never unmounts.
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    await waitFor(() => expect(screen.getByText('Pass')).toBeTruthy());

    fireEvent.press(pass);

    // Two passes stop the game; they do not finish it. No result screen yet.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept score' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Resume play' })).toBeTruthy();
    expect(screen.queryByText(/White by 7\.5/)).toBeNull();
  });

  it('scores the board when the review is accepted', async () => {
    await startGame('Pass & Play');
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    fireEvent.press(pass);

    fireEvent.press(await screen.findByRole('button', { name: 'Accept score' }));

    // An empty board is all neutral, so white takes it on komi alone — and the
    // result has to be stated in points, not just as a winner.
    await waitFor(() => expect(screen.getByText(/White by 7\.5/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Black 0, White 7\.5/)).toBeTruthy());
  });

  it('goes back to the board on resume, and does not end on the next single pass', async () => {
    await startGame('Pass & Play');
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    fireEvent.press(pass);

    fireEvent.press(await screen.findByRole('button', { name: 'Resume play' }));

    await waitFor(() => expect(screen.getByText('interactive:true')).toBeTruthy());

    // The move ribbon now carries its own "Pass" chips for the two that were
    // played, so the bar's button is the last match rather than the only one.
    const barPass = screen.getAllByRole('button', { name: /^Pass$/ }).at(-1)!;
    fireEvent.press(barPass);
    expect(screen.queryByRole('button', { name: 'Accept score' })).toBeNull();
  });

  it('lets two humans argue about a group, and marks a whole chain at a time', async () => {
    await startGame('Pass & Play');
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());

    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    fireEvent.press(pass);

    // A lone stone on an open board is not provably dead, so nothing is marked —
    // and pass-and-play is the one mode where a human may say otherwise.
    await waitFor(() => expect(screen.getByText('markable:true')).toBeTruthy());
    expect(screen.getByText('dead:0')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('dead:1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('dead:0')).toBeTruthy());
  });

  it('does not let the marks be edited against the bot', async () => {
    await startGame('vs Bot');
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);

    // The bot answers the pass with one of its own, which opens the review.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept score' })).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(screen.getByText('markable:false')).toBeTruthy();
  }, 20_000);

  it('makes the board inert once the game is over', async () => {
    await startGame('Pass & Play');
    const pass = screen.getByRole('button', { name: /^Pass$/ });
    fireEvent.press(pass);
    fireEvent.press(pass);
    fireEvent.press(await screen.findByRole('button', { name: 'Accept score' }));

    await waitFor(() => expect(screen.getByText('interactive:false')).toBeTruthy());
  });
});

/**
 * `ux-fix-ideas.md` §2.1 and §2.4: the second visit costs less than the first,
 * and closing the app mid-game no longer loses the game.
 */
describe('GoScreen — remembering', () => {
  it('reopens on the mode and rules chosen last time', async () => {
    const first = await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    fireEvent.press(screen.getByRole('button', { name: /^Territory scoring/ }));
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    await reopen(first);

    expect(await screen.findByRole('button', { name: /Pass & Play/ })).toBeSelected();
    expect(screen.getByText(/9×9 · territory scoring · no komi/)).toBeTruthy();
  });

  it('keeps each mode\'s choices apart', async () => {
    const first = await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    // Pass-and-play has its own remembered rules, still the defaults.
    expect(screen.getByText(/9×9 · area scoring · 7\.5 komi to white/)).toBeTruthy();
    first.unmount();
  });

  it('offers an abandoned game back, and resumes it where it was left', async () => {
    const first = await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));
    await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());
    // Closing the app mid-game.
    await reopen(first);

    expect(await screen.findByText('Game in progress')).toBeTruthy();
    expect(screen.getByText(/Pass & Play · 1 move in/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
    expect(screen.getByText('E5')).toBeTruthy();
    // Resumed under the rules it was started with.
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('opens straight onto the unfinished game from the launcher', async () => {
    const first = await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));
    await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());
    await reopen(first, { resume: '1' });

    expect(await screen.findByLabelText('go board')).toBeTruthy();
    expect(screen.getByText('E5')).toBeTruthy();
  });

  it('discards a casual game without asking', async () => {
    const first = await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    fireEvent.press(screen.getByRole('button', { name: /Start Game/ }));
    await waitFor(() => expect(screen.getByLabelText('go board')).toBeTruthy());
    mockBoard.move = 'e5';
    fireEvent.press(screen.getByLabelText('go board'));
    await waitFor(() => expect(screen.getByText('E5')).toBeTruthy());
    await reopen(first);

    fireEvent.press(await screen.findByRole('button', { name: 'Discard' }));
    // Findable by storage first: the removal is what the card waits on.
    await waitFor(async () => expect(await AsyncStorage.getItem('gx:inprogress:go:guest')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Game in progress')).toBeNull());
  });
});
