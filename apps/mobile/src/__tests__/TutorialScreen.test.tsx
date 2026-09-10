import { render, screen } from '@testing-library/react-native';
import { TUTORIALS } from '@gameexplorer/shared';
import { TutorialScreen } from '@/components/learn/TutorialScreen';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The "How to play" screen, which had no test at all until Go's tutorial was
 * rewritten.
 *
 * The gap mattered: this screen once drew a **chess knight** on the Go tutorial
 * and typechecked cleanly, because a runtime guard laundered the game id and
 * fell back to chess. The guard is now a compile-time one, and the assertions
 * below pin the thing the guard was supposed to protect — that every game's
 * hero art is its own.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  // The lesson strip under the hero re-reads completion on focus, so this
  // screen now needs the same shim `PuzzlesCard.test.tsx` uses.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => undefined | (() => void)) => require('react').useEffect(cb, [cb]),
}));

function renderTutorial(game: keyof typeof TUTORIALS) {
  return render(
    <SettingsProvider>
      <TutorialScreen tutorial={TUTORIALS[game]} />
    </SettingsProvider>,
  );
}

/** The art each game's hero badge must draw, by its accessibility label. */
const HERO_ART: Record<keyof typeof TUTORIALS, string> = {
  chess: 'white knight',
  checkers: 'white king',
  reversi: 'black disc',
  go: 'white stone',
  liquidate: 'planet',
};

describe('TutorialScreen', () => {
  beforeEach(() => mockPush.mockClear());

  it.each(Object.keys(TUTORIALS) as (keyof typeof TUTORIALS)[])(
    'draws %s its own hero art, never another game’s',
    (game) => {
      renderTutorial(game);
      expect(screen.getByLabelText(HERO_ART[game])).toBeOnTheScreen();

      for (const [other, art] of Object.entries(HERO_ART)) {
        if (other === game || art === HERO_ART[game]) continue;
        expect(screen.queryByLabelText(art)).toBeNull();
      }
    },
  );

  it('renders every section of the Go tutorial in order', () => {
    renderTutorial('go');
    expect(screen.getByText(TUTORIALS.go.title)).toBeOnTheScreen();
    for (const section of TUTORIALS.go.sections) {
      expect(screen.getByText(section.heading)).toBeOnTheScreen();
    }
  });

  it('renders a diagram for every section that has one', () => {
    renderTutorial('go');
    for (const section of TUTORIALS.go.sections) {
      for (const diagram of section.diagrams ?? []) {
        // Each board is labelled with its own caption, which is also what a
        // screen reader is given in place of the picture.
        expect(screen.getByLabelText(diagram.caption)).toBeOnTheScreen();
      }
    }
  });

  it('gives the counting section a shaded board and explains it in words too', () => {
    /*
     * What is NOT asserted here, deliberately: that the 63 territory squares
     * appear. `BoardFrame` renders through a measure callback and there is no
     * layout under jest, so `px` is 0 and nothing inside the frame is drawn —
     * the same line every board test in this repo draws. That the shading is
     * *correct* is pinned where it can be, against the engine, in
     * `packages/shared/src/constants/tutorials/tutorials.test.ts`.
     *
     * What this does check is the part that survives a reader who cannot see
     * the picture at all: the board is announced by its caption, and the count
     * is also spelled out in the prose beside it.
     */
    const scoring = TUTORIALS.go.sections.find((s) => s.id === 'scoring')!;
    const diagram = scoring.diagrams![0];
    if (diagram.game !== 'go') throw new Error('unreachable');
    expect(diagram.territory!.length).toBeGreaterThan(0);

    renderTutorial('go');
    expect(screen.getByLabelText(diagram.caption)).toBeOnTheScreen();
    for (const paragraph of scoring.paragraphs) {
      expect(screen.getByText(paragraph)).toBeOnTheScreen();
    }
  });

  it('shows the tips and the play call to action', () => {
    renderTutorial('go');
    for (const tip of TUTORIALS.go.tips) {
      expect(screen.getByText(tip)).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: TUTORIALS.go.ctaLabel })).toBeOnTheScreen();
  });
});
