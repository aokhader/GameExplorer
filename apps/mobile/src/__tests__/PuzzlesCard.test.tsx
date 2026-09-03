import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import { MOBILE_PUZZLE_PROGRESS_KEY, staticPuzzleSource } from '@finesse/shared';
import { PuzzlesCard } from '@/game/PuzzlesCard';

/**
 * `useFocusEffect` is what keeps the count fresh when the player comes back from
 * a puzzle, and there is no navigator here to fire it — so it runs once on
 * mount, which is the behaviour these tests care about. Cleanup is returned so
 * the card's `active` guard is exercised the same way it is in the app.
 */
jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => undefined | (() => void)) => require('react').useEffect(cb, [cb]),
}));

async function renderCard(game: 'chess' | 'checkers' | 'reversi' = 'chess') {
  render(<PuzzlesCard game={game} />);
  // The count is two awaits deep (source + storage), so nothing asserts until
  // it lands.
  return screen.findByTestId('puzzles-card-progress');
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('PuzzlesCard', () => {
  it('reports none solved on a fresh install', async () => {
    const total = await staticPuzzleSource.countPuzzles('chess');
    const count = await renderCard();
    expect(count).toHaveTextContent(new RegExp(`0 / ${total}`));
    expect(screen.getByText(/Set positions with one right answer/)).toBeOnTheScreen();
  });

  it('counts only this game’s solves', async () => {
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        // Two chess ids and one from another game — the card must not add that
        // third one in, which is exactly what a naive `solved.length` would do.
        solved: ['chess-001', 'chess-002', 'reversi-001'],
        streak: 3,
        bestStreak: 3,
        lastSeen: {},
        updatedAt: '',
      }),
    );

    const total = await staticPuzzleSource.countPuzzles('chess');
    const count = await renderCard();
    expect(count).toHaveTextContent(new RegExp(`2 / ${total}`));
    expect(screen.getByText(/3 clean in a row/)).toBeOnTheScreen();
  });

  it('says the set is finished once every puzzle is solved', async () => {
    const all = await staticPuzzleSource.listPuzzles({ game: 'reversi' });
    await AsyncStorage.setItem(
      MOBILE_PUZZLE_PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        solved: all.map((p) => p.id),
        streak: 0,
        bestStreak: 0,
        lastSeen: {},
        updatedAt: '',
      }),
    );

    await renderCard('reversi');
    expect(screen.getByText(/solved every one of these/)).toBeOnTheScreen();
  });

  it('falls back to zero solved on an unreadable record', async () => {
    await AsyncStorage.setItem(MOBILE_PUZZLE_PROGRESS_KEY, '{ not json');

    const total = await staticPuzzleSource.countPuzzles('chess');
    const count = await renderCard();
    // A corrupt record costs the streak, never the screen — and the card has to
    // show *something*, because "no count" reads as "no puzzles".
    expect(count).toHaveTextContent(new RegExp(`0 / ${total}`));
  });
});
