import { render, screen } from '@testing-library/react-native';
import { setActiveTheme } from '@gameexplorer/ui';
import { StatusBanner } from '@/game/StatusBanner';

afterEach(() => setActiveTheme('dark'));

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

  // This banner is the last component still holding its own colour table
  // instead of reading tokens, so `noFrozenTokens` cannot see it: its literals
  // are raw hex, not a captured `COLORS.x`. It shipped Arcade-blue on a cream
  // page for exactly that reason, and only the puzzle screen renders it now.
  it('takes its accent from the active theme, not a fixed palette', () => {
    render(<StatusBanner accent="chess" title="Your move" />);
    const arcade = screen.getByText('Your move').props.style.color;

    screen.unmount();
    setActiveTheme('cozy');
    render(<StatusBanner accent="chess" title="Your move" />);
    const cozy = screen.getByText('Your move').props.style.color;

    expect(arcade).toBe('#7db1ff');
    expect(cozy).toBe('#8b5a2b');
  });
});
