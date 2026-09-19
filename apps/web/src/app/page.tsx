import { CHESS_PUZZLES, GAME_LIST, gameNameList, type Puzzle } from '@gameexplorer/shared';
import '@/components/chess/ChessBoard.css';
import { DailyPuzzle } from '@/components/home/DailyPuzzle';
import { FirstRunPicker } from '@/components/home/FirstRunPicker';
import { ReturningCheck } from '@/components/home/ReturningCheck';
import { SiteFooter } from '@/components/home/SiteFooter';
import chessIndex from '../../public/puzzles/chess/index.json';
import checkersIndex from '../../public/puzzles/checkers/index.json';
import reversiIndex from '../../public/puzzles/reversi/index.json';
import goIndex from '../../public/puzzles/go/index.json';

/**
 * The stranger's landing page (`project-docs/ux-fix-ideas.md` §4.1, §4.2). A
 * visitor with any history never sees it: the `gx_returning` cookie rewrites
 * `/` to the launcher at `/home` (`next.config.ts`), and `ReturningCheck`
 * catches the players whose history predates the cookie.
 *
 * Top to bottom, one viewport on a desktop: a headline every clause of which
 * can be checked, the one question a first visit asks (which game, and do you
 * know it), and the product itself — today's puzzle, on a board you can solve.
 * Then only true numbers. It used to open on a gradient wordmark over an
 * aurora, with a Features grid that made claims the app did not keep.
 *
 * Server-rendered, and nothing enters on first load: that rule was bought with
 * a measured LCP regression (`05-ui-web.md`, Motion). Regenerated hourly so
 * the puzzle follows the date without making the page dynamic.
 */

export const revalidate = 3600;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One puzzle a day from the hand-written set — each of those explains its
 * answer — and not the hardest, since this is someone's first board here.
 */
function todaysPuzzle(now: number): Puzzle {
  const pool = CHESS_PUZZLES.filter((p) => p.difficulty !== 'hard');
  return pool[Math.floor(now / DAY_MS) % pool.length];
}

/** Every puzzle the puzzle screens can serve, read from the corpus at build time. */
function puzzleCount(): number {
  return [chessIndex, checkersIndex, reversiIndex, goIndex].reduce(
    (sum, index) => sum + Object.values(index.bands).reduce((n, band) => n + band.total, 0),
    0,
  );
}

export default function LandingPage() {
  // A server component, rendered once per revalidation: reading the clock is the
  // point — it is what makes the puzzle follow the date.
  // eslint-disable-next-line react-hooks/purity
  const puzzle = todaysPuzzle(Date.now());
  const puzzles = puzzleCount();

  return (
    <div className="min-h-svh pt-16">
      <ReturningCheck />
      <div className="container mx-auto max-w-5xl px-4 pt-6 pb-12">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            {/* Every clause here can be checked against the product. The names
                come from the catalog, so a new game joins the sentence by
                existing. */}
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-4xl sm:font-bold">
              {gameNameList()} — free, with no sign-up to play.
            </h1>

            <div className="mt-6">
              <FirstRunPicker />
            </div>

            {/* Numbers that are facts about the product, not adjectives about
                it. One quiet line: they support the choice above rather than
                compete with it. */}
            <p className="mt-6 text-sm text-fg-muted" data-testid="landing-facts">
              {GAME_LIST.length} games · {puzzles.toLocaleString('en-US')} puzzles · no account needed to play
            </p>
          </div>

          <DailyPuzzle puzzle={puzzle} />
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
