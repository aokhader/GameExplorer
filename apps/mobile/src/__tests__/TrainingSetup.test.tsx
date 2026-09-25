import { render, screen } from '@testing-library/react-native';
import type { UserRating } from '@gameexplorer/db';
import { TrainingSetup } from '@/game/TrainingSetup';
import { eloLabel } from '@/game/eloLabel';

// Renders shared primitives, which animate with reanimated.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function ratingRow(overrides: Partial<UserRating> = {}): UserRating {
  return {
    user_id: 'u1',
    game_type: 'chess',
    rating: 1450,
    games_played: 42,
    wins: 20,
    losses: 15,
    draws: 7,
    peak_rating: 1500,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof TrainingSetup>> = {}) {
  return render(
    <TrainingSetup
      game="chess"
      rating={ratingRow()}
      loading={false}
      botElo={1450}
      signedIn
      online
      {...props}
    />,
  );
}

describe('TrainingSetup', () => {
  it('shows the practice level, its label, and the matched bot', () => {
    renderPanel();
    // The player's number is the Practice level — never called a rating (GX-04).
    expect(screen.getByText('YOUR PRACTICE LEVEL')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Your practice level is 1450, ${eloLabel('chess', 1450)}`)).toBeOnTheScreen();
    expect(screen.getByText('Matched to your practice level automatically')).toBeOnTheScreen();
    expect(screen.getAllByText('1450').length).toBeGreaterThan(0);
    // Both the player and the bot carry the same ladder name at equal ratings.
    expect(screen.getAllByText(eloLabel('chess', 1450)).length).toBe(2);
    expect(screen.getByText(/42 games/)).toBeOnTheScreen();
    expect(screen.getByText('20W / 15L / 7D')).toBeOnTheScreen();
    expect(screen.getByText(/Peak 1500/)).toBeOnTheScreen();
  });

  it('flags a provisional practice level and counts the games left', () => {
    renderPanel({ rating: ratingRow({ games_played: 28 }) });
    expect(screen.getByText(/your practice level moves faster for 2 more games/)).toBeOnTheScreen();
  });

  it('drops the provisional note once the practice level has settled', () => {
    renderPanel({ rating: ratingRow({ games_played: 30 }) });
    expect(screen.queryByText(/Provisional/)).toBeNull();
  });

  it('asks a guest to sign in instead of showing a practice level', () => {
    renderPanel({ signedIn: false, rating: null });
    expect(screen.getByText('Training needs an account')).toBeOnTheScreen();
    expect(screen.getByText(/so your practice level has to live somewhere/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByText('YOUR PRACTICE LEVEL')).toBeNull();
  });

  it('explains the offline block, and offers no sign-in for it', () => {
    renderPanel({ online: false });
    expect(screen.getByText('Training needs a connection')).toBeOnTheScreen();
    expect(screen.getByText(/Rated games read and write your practice level/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('always states what a hint costs, in points', () => {
    renderPanel();
    expect(screen.getByText(/Each hint costs 2 points off your result/)).toBeOnTheScreen();
    expect(screen.queryByText(/rating/i)).toBeNull();
  });
});

describe('eloLabel', () => {
  it('uses the wider chess ladder', () => {
    expect(eloLabel('chess', 550)).toBe('Beginner');
    expect(eloLabel('chess', 1450)).toBe('Competitive');
    expect(eloLabel('chess', 2700)).toBe('Grandmaster');
  });

  it('uses the shorter ladder for checkers and reversi', () => {
    expect(eloLabel('reversi', 650)).toBe('Beginner');
    expect(eloLabel('checkers', 1450)).toBe('Skilled');
    expect(eloLabel('checkers', 2000)).toBe('Master');
  });

  it('treats each boundary as the start of the next rung', () => {
    expect(eloLabel('chess', 1400)).toBe('Competitive');
    expect(eloLabel('chess', 1399)).toBe('Intermediate');
  });
});
