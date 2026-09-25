import { render, screen } from '@testing-library/react-native';
import type { GameListItem, GameType, UserRating } from '@gameexplorer/db';
import { summarizePlayer, type PlayerStats } from '@gameexplorer/client/game/playerStats';
import { NumbersRow } from '@/home/LauncherParts';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());
jest.mock('@/providers/SettingsProvider', () => ({
  useFeedbackPrefs: () => ({ reducedMotion: true, haptics: false }),
}));

const row = (game_type: GameType, rating: number, games_played: number): UserRating => ({
  user_id: 'u1',
  game_type,
  rating,
  games_played,
  wins: 0,
  losses: 0,
  draws: 0,
  peak_rating: rating,
  updated_at: '',
});

const game = (opponent: string, before: number, after: number) =>
  ({
    id: `${opponent}-${after}`,
    game_type: 'chess',
    opponent,
    rating_before: before,
    rating_after: after,
    result: 'white',
    player_color: 'white',
    created_at: '',
  }) as unknown as GameListItem;

function renderRow(stats: PlayerStats | null, props: Partial<React.ComponentProps<typeof NumbersRow>> = {}) {
  return render(
    <NumbersRow
      signedIn
      stats={stats}
      loading={false}
      error={false}
      onRetry={jest.fn()}
      puzzlesSolved={0}
      finishedGame={false}
      onSignIn={jest.fn()}
      {...props}
    />,
  );
}

/**
 * The launcher's own numbers (security audit v2, GX-04): the Practice level is
 * the chip every rated bot game earns; the online Rating joins it, tagged, only
 * once an online rated game has moved it.
 */
describe('NumbersRow', () => {
  it('shows the practice level, then the online rating once it has moved', () => {
    const stats = summarizePlayer(
      [game('bot', 1468, 1480), game('alice', 1220, 1210)],
      { chess: row('chess', 1480, 12), checkers: row('checkers', 1200, 0) },
      { chess: row('chess', 1210, 3), checkers: row('checkers', 1200, 0) },
    );
    renderRow(stats);

    expect(screen.getByLabelText('Chess practice level 1480, up 12')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chess rating 1210, down 10')).toBeOnTheScreen();
    expect(screen.getByText('Rating')).toBeOnTheScreen();
    // An untouched row is not a number anyone earned.
    expect(screen.queryByLabelText(/Checkers/)).toBeNull();
  });

  it('leaves the online chip out until an online game has been rated', () => {
    const stats = summarizePlayer([], { chess: row('chess', 1480, 12) }, { chess: row('chess', 1200, 0) });
    renderRow(stats);

    expect(screen.getByLabelText('Chess practice level 1480')).toBeOnTheScreen();
    expect(screen.queryByText('Rating')).toBeNull();
  });

  it('says what failed, and what a guest is missing', () => {
    renderRow(null, { error: true });
    expect(screen.getByText(/load your numbers\./)).toBeOnTheScreen();

    screen.unmount();
    renderRow(null, { signedIn: false, finishedGame: true });
    expect(screen.getByText(/A practice level needs an account\./)).toBeOnTheScreen();
  });
});
