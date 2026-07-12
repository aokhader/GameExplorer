import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GameActions } from '@/game/GameActions';

describe('GameActions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires onDraw immediately', () => {
    const onDraw = jest.fn();
    render(<GameActions onDraw={onDraw} onResign={() => {}} />);
    fireEvent.press(screen.getByRole('button', { name: 'Offer draw' }));
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('requires a second tap to resign', () => {
    const onResign = jest.fn();
    render(<GameActions onResign={onResign} />);

    fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    expect(onResign).not.toHaveBeenCalled();
    expect(screen.getByText('Resign?')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm resign' }));
    expect(onResign).toHaveBeenCalledTimes(1);
  });

  it('resets the confirm state after 3 seconds', () => {
    const onResign = jest.fn();
    render(<GameActions onResign={onResign} />);

    fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    // The confirm expired — the next tap arms again instead of resigning.
    fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    expect(onResign).not.toHaveBeenCalled();
  });

  it('disables both buttons once the game is over', () => {
    const onDraw = jest.fn();
    const onResign = jest.fn();
    render(<GameActions onDraw={onDraw} onResign={onResign} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Offer draw' }));
    fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    expect(onDraw).not.toHaveBeenCalled();
    expect(onResign).not.toHaveBeenCalled();
  });
});
