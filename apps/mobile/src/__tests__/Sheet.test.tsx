import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { Sheet, SHEET_DISMISS, shouldDismissSheet } from '@/components/ui/Sheet';

// The sheet rises, slides away and follows a drag with reanimated.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

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

  it('slides away on a scrim tap, then closes', async () => {
    const onClose = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        <Body />
      </Sheet>,
    );
    fireEvent.press(last('Close'));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('closes once however often the scrim is tapped while it slides away', async () => {
    const onClose = jest.fn();
    render(
      <Sheet open onClose={onClose}>
        <Body />
      </Sheet>,
    );
    fireEvent.press(last('Close'));
    fireEvent.press(last('Close'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('vanishes at once when its owner closes it, so a navigation that follows is safe', () => {
    const { rerender } = render(
      <Sheet open onClose={jest.fn()}>
        <Body />
      </Sheet>,
    );
    rerender(
      <Sheet open={false} onClose={jest.fn()}>
        <Body />
      </Sheet>,
    );
    expect(screen.queryByText('Sheet body')).toBeNull();
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

describe('shouldDismissSheet', () => {
  const HEIGHT = 400;
  const EDGE = HEIGHT * SHEET_DISMISS.distanceRatio;

  it('dismisses a drag released past 30% of the sheet', () => {
    expect(shouldDismissSheet(EDGE + 1, 0, HEIGHT)).toBe(true);
    expect(shouldDismissSheet(EDGE - 1, 0, HEIGHT)).toBe(false);
  });

  it('dismisses a downward fling however short the drag', () => {
    expect(shouldDismissSheet(10, SHEET_DISMISS.velocity + 1, HEIGHT)).toBe(true);
  });

  it('never dismisses a fling back upward', () => {
    expect(shouldDismissSheet(EDGE - 1, -2000, HEIGHT)).toBe(false);
  });

  it('counts only a fling before the sheet has been measured', () => {
    expect(shouldDismissSheet(200, 0, 0)).toBe(false);
    expect(shouldDismissSheet(200, SHEET_DISMISS.velocity + 1, 0)).toBe(true);
  });
});
