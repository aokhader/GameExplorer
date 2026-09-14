/**
 * Function-form `style` on `Pressable` works in this app.
 *
 * It did not while NativeWind was installed. NativeWind was the JSX import
 * source, and its wrapper around `Pressable` silently dropped a function-form
 * `style`: no error, just a control with no background, no width and no press
 * response. That is why the home screen's primary CTA, all five game cards and
 * the tab bar's Play button had no press feedback, and why several components
 * read `pressed` from the children function instead.
 *
 * NativeWind is gone, and this test pins the behaviour it broke. It asserts the
 * resting style only. A press cannot be held open here: the testing library's
 * `pressIn` calls an `onPressIn` prop, while Pressable tracks its pressed state
 * internally through the responder system, so the pressed branch never renders
 * under test. That is a limit of the harness, not of the component.
 */
import { Pressable, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

describe('Pressable style', () => {
  it('applies a function-form style', () => {
    render(
      <Pressable
        testID="press"
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, backgroundColor: 'red', width: 120 })}
      >
        <Text>Play</Text>
      </Pressable>,
    );

    expect(screen.getByTestId('press')).toHaveStyle({ backgroundColor: 'red', width: 120, opacity: 1 });
  });
});
