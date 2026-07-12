import { render, screen } from '@testing-library/react-native';
import { StatusBanner } from '@/game/StatusBanner';

describe('StatusBanner', () => {
  it('renders the headline and description', () => {
    render(<StatusBanner accent="chess" title="Your move" description="White to play." />);
    expect(screen.getByText('Your move')).toBeOnTheScreen();
    expect(screen.getByText('White to play.')).toBeOnTheScreen();
  });

  it('renders without a description', () => {
    render(<StatusBanner title="Bot is thinking…" />);
    expect(screen.getByText('Bot is thinking…')).toBeOnTheScreen();
  });
});
