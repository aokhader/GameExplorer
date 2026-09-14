/**
 * Reanimated, flattened to plain React Native — for tests of components that
 * merely animate something into place.
 *
 * Importing the real library from a test blows up inside react-native-worklets,
 * which expects a native runtime, and reanimated 4's own `mock` entry re-imports
 * that same index, so it doesn't help. This substitutes the handful of
 * primitives our components use: animated views render as ordinary ones, shared
 * values are plain objects, and every `with*` helper jumps straight to its final
 * value.
 *
 * Opt in per file rather than globally — gesture-handler's `GestureDetector`
 * uses reanimated's real internals, so a blanket mock breaks every board and
 * slider test. Real animation and gesture behaviour is covered by the Maestro
 * e2e flow (see jest.config.js).
 *
 * Usage, at the top of a test file:
 *
 *     jest.mock('react-native-reanimated', () =>
 *       require('./helpers/reanimatedMock').mockReanimated(),
 *     );
 */
export function mockReanimated() {
  // Required lazily: jest.mock factories are hoisted above imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  const passthrough = (toValue: any) => toValue;

  return {
    __esModule: true,
    default: {
      View: RN.View,
      Text: RN.Text,
      Image: RN.Image,
      ScrollView: RN.ScrollView,
      createAnimatedComponent: (component: unknown) => component,
    },
    // `get`/`set` are reanimated's lint-safe accessors, which `PressableScale` writes through.
    useSharedValue: (initial: unknown) => {
      const shared = {
        value: initial,
        get: () => shared.value,
        set: (next: unknown) => {
          shared.value = typeof next === 'function' ? (next as (v: unknown) => unknown)(shared.value) : next;
        },
      };
      return shared;
    },
    // Styles are computed once at render — there are no animation frames here.
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useAnimatedRef: () => ({ current: null }),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    // Gesture-handler's `GestureDetector` calls this whenever it finds reanimated
    // installed, which a mock looks like. With `runOnJS(true)` gestures — the
    // only kind this app writes — nothing ever reads the handler it returns, so
    // a `Sheet`'s drag strip can mount under the mock.
    useEvent: () => undefined,
    withTiming: passthrough,
    withSpring: passthrough,
    withDelay: (_delay: number, animation: unknown) => animation,
    // A sequence settles on its last step.
    withSequence: (...steps: unknown[]) => steps[steps.length - 1],
    withRepeat: passthrough,
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
    cancelAnimation: () => {},
    Easing: {
      linear: (t: number) => t,
      ease: (t: number) => t,
      quad: (t: number) => t,
      // `src/theme/motion.ts` builds every token curve with this, often at module
      // scope in a board file — so a mock without it fails at import, in every
      // suite that renders anything animated.
      bezier: () => (t: number) => t,
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
    },
  };
}
