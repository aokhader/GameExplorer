import { render, screen } from '@testing-library/react-native';
import { CapturedTray } from '@/game/CapturedTray';

describe('CapturedTray', () => {
  it('renders nothing before the first capture', () => {
    render(<CapturedTray pieces={[]} color="black" advantage={0} ownerLabel="You" />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the material lead only for the player who is ahead', () => {
    render(<CapturedTray pieces={['pawn', 'rook']} color="black" advantage={6} ownerLabel="You" />);
    expect(screen.getByText('+6')).toBeOnTheScreen();

    screen.unmount();
    render(<CapturedTray pieces={['pawn']} color="white" advantage={-6} ownerLabel="Bot" />);
    expect(screen.queryByText(/^[+-]/)).toBeNull();
  });

  it('still renders for a promotion lead with an empty tray', () => {
    render(<CapturedTray pieces={[]} color="black" advantage={8} ownerLabel="You" />);
    expect(screen.getByText('+8')).toBeOnTheScreen();
  });

  it('summarises the tray as one sentence for screen readers', () => {
    render(
      <CapturedTray
        pieces={['pawn', 'pawn', 'knight']}
        color="black"
        advantage={5}
        ownerLabel="You"
      />,
    );
    expect(screen.getByLabelText('You captured 2 pawns, 1 knight — up 5 points')).toBeOnTheScreen();
  });

  it('uses the singular for a one-point lead', () => {
    render(<CapturedTray pieces={['pawn']} color="black" advantage={1} ownerLabel="Bot" />);
    expect(screen.getByLabelText('Bot captured 1 pawn — up 1 point')).toBeOnTheScreen();
  });
});
