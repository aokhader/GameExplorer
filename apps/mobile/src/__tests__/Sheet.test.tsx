import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';

/**
 * jest-expo's Modal mock renders its children twice: an inert copy first, then
 * the live one that carries the press handlers. Queries therefore take the LAST
 * match, matching the convention in `GameBar.test.tsx`.
 */
const last = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;

function Body() {
  return <Text>Sheet body</Text>;
}

describe('Sheet', () => {
  it('renders its children when open', () => {
    render(
      <Sheet open onClose={jest.fn()}>
        <Body />
      </Sheet>,
    );
    expect(screen.getAllByText('Sheet body').length).toBeGreaterThan(0);
  });

  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={jest.fn()}>
        <Body />
      </Sheet>,
    );
    expect(screen.queryByText('Sheet body')).toBeNull();
  });

  it('closes on a scrim tap', () => {
    const onClose = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        <Body />
      </Sheet>,
    );
    fireEvent.press(last('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes a custom scrim label, so each sheet reads distinctly', () => {
    render(
      <Sheet open onClose={jest.fn()} closeLabel="Close menu">
        <Body />
      </Sheet>,
    );
    expect(screen.queryAllByRole('button', { name: 'Close menu' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);
  });

  it('does not close when the sheet body itself is pressed', () => {
    const onClose = jest.fn();
    const onInner = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        <Pressable accessibilityRole="button" accessibilityLabel="Inner" onPress={onInner}>
          <Text>Inner</Text>
        </Pressable>
      </Sheet>,
    );

    fireEvent.press(last('Inner'));
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
