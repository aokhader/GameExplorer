import { render } from '@testing-library/react-native';
import { setActiveTheme } from '@gameexplorer/ui';
import { Confetti } from '@/game/Confetti';

// Confetti only animates something into place — no gestures — so the flattened
// reanimated stand-in applies. `require` rather than the imported helper: jest
// hoists mock factories above every import, so the binding wouldn't exist yet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

afterEach(() => setActiveTheme('dark'));

/**
 * Web celebrates a win with canvas-confetti; mobile shipped without any, and the
 * result screen's own comment called it a deferred polish item. This is the
 * native equivalent, and the contract worth pinning is the *absence* cases —
 * a celebration that ignores "reduce motion" is the exact thing that setting
 * exists to stop, and it fails silently because the screen still looks fine.
 */
describe('Confetti', () => {
  const pieces = (tree: ReturnType<typeof render>) =>
    tree.UNSAFE_root.findAllByType('View' as never).length;

  it('renders nothing when reduced motion is on', () => {
    const withMotion = render(<Confetti active reducedMotion={false} />);
    const reduced = render(<Confetti active reducedMotion />);
    expect(reduced.toJSON()).toBeNull();
    // …and the comparison is meaningful only because the other case renders.
    expect(withMotion.toJSON()).not.toBeNull();
    expect(pieces(withMotion)).toBeGreaterThan(1);
  });

  it('renders nothing when inactive', () => {
    expect(render(<Confetti active={false} reducedMotion={false} />).toJSON()).toBeNull();
  });

  it('does not intercept touches on the result screen underneath', () => {
    const tree = render(<Confetti active reducedMotion={false} />);
    const root = tree.toJSON();
    expect(root).not.toBeNull();
    expect((root as { props: Record<string, unknown> }).props.pointerEvents).toBe('none');
  });
});
