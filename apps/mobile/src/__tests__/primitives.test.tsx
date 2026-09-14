import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card, EmptyState, ErrorState, TextField, Toggle } from '@/components/ui';

/**
 * The shared primitives' contracts: roles, names, states and callbacks. How they
 * move is `motion-spec.md`'s business and needs a device to see; what a screen
 * reader and a caller can rely on is checked here.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

describe('Toggle', () => {
  it('reports its state as a switch and asks for the opposite', () => {
    const onValueChange = jest.fn();
    render(<Toggle value={false} onValueChange={onValueChange} label="Sound" />);
    const toggle = screen.getByRole('switch', { name: 'Sound' });
    expect(toggle).not.toBeChecked();
    fireEvent.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('is inert when disabled', () => {
    const onValueChange = jest.fn();
    render(<Toggle value onValueChange={onValueChange} label="Sound" disabled />);
    const toggle = screen.getByRole('switch', { name: 'Sound' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    fireEvent.press(toggle);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('is named by its label, which the Text above it cannot do alone', () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
  });

  it('shows an error in place of its hint', () => {
    const { rerender } = render(<TextField label="Username" hint="Letters and numbers" />);
    expect(screen.getByText('Letters and numbers')).toBeOnTheScreen();

    rerender(<TextField label="Username" hint="Letters and numbers" error="That name is taken" />);
    expect(screen.getByText('That name is taken')).toBeOnTheScreen();
    expect(screen.queryByText('Letters and numbers')).toBeNull();
  });

  it("still hears a caller's own focus listener", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(<TextField label="Email" onFocus={onFocus} onBlur={onBlur} />);
    fireEvent(screen.getByLabelText('Email'), 'focus');
    fireEvent(screen.getByLabelText('Email'), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe('Card', () => {
  it('is a plain surface without onPress', () => {
    render(
      <Card>
        <Text>Ratings</Text>
      </Card>,
    );
    expect(screen.getByText('Ratings')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a single button with onPress', () => {
    const onPress = jest.fn();
    render(
      <Card onPress={onPress} accessibilityLabel="Open chess">
        <Text>Chess</Text>
      </Card>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Open chess' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('says what is missing and offers the one action that fills it', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        icon="trophy"
        title="No games yet"
        body="Finished games are listed here."
        action={{ label: 'Play a bot', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'No games yet' })).toBeOnTheScreen();
    expect(screen.getByText('Finished games are listed here.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Play a bot' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorState', () => {
  it('names the failure and retries', () => {
    const onRetry = jest.fn();
    render(<ErrorState title="Could not load your games" onRetry={onRetry} />);
    expect(screen.getByRole('header', { name: 'Could not load your games' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry when there is nothing a retry could fix', () => {
    render(<ErrorState title="That game could not be found" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reports a retry in flight as busy', () => {
    render(<ErrorState title="Could not load your games" onRetry={jest.fn()} retrying />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeBusy();
  });
});
