import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '@/components/ui';

describe('Button', () => {
  it('fires onPress and exposes the label to accessibility', () => {
    const onPress = jest.fn();
    render(<Button label="Play now" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses and reports disabled state when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Start" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Start' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports busy while loading (secondary variant)', () => {
    render(<Button label="Saving" onPress={() => {}} variant="secondary" loading />);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });
});
