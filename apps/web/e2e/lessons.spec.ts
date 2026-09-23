import { test, expect, type Page } from '@playwright/test';
import { LESSONS, WEB_LESSON_PROGRESS_KEY } from '@gameexplorer/shared';

/**
 * Coached lessons, end to end, signed out.
 *
 * Everything here runs as a guest, because that is the point of the mode:
 * progress lives in `localStorage` under `ge:lessons` and nothing in the flow
 * touches auth. A brand-new visitor is the intended user.
 */

const CHESS_L01 = LESSONS.chess.lessons[0];

/**
 * Index of a square in the chess board's DOM order.
 *
 * Lifted from `puzzles.spec.ts`, and kept as a copy on purpose: the two specs
 * are read independently, and the translation is three lines. a8 is 0, a1 is 56.
 */
function chessSquare(page: Page, square: string) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return page.locator('.chess-board > .square').nth((8 - rank) * 8 + file);
}

/** Click from-square then to-square, which is how the board takes a move. */
async function playChess(page: Page, from: string, to: string) {
  await chessSquare(page, from).click();
  await chessSquare(page, to).click();
}

test('the rules page carries a lesson strip and a per-section link', async ({ page }) => {
  await page.goto('/chess/learn');

  const index = page.getByTestId('lesson-index');
  await expect(index).toBeVisible();
  await expect(index.getByTestId('lesson-card')).toHaveCount(LESSONS.chess.lessons.length);

  // The rules prose is still there — the lessons sit beside it, not instead of
  // it. These four routes are the SEO surface and work with JS disabled.
  await expect(page.getByRole('heading', { name: 'Pawns' })).toBeVisible();

  // And every section a lesson teaches offers a way into it.
  await expect(page.getByTestId('section-lesson-link').first()).toBeVisible();
});

test('a lesson card opens the lesson', async ({ page }) => {
  await page.goto('/chess/learn');
  await page.getByTestId('lesson-card').first().click();

  await expect(page).toHaveURL(new RegExp(`/chess/learn/${CHESS_L01.id}$`));
  await expect(page.getByTestId('coach-say')).toHaveText(CHESS_L01.steps[0].instruction);
});

test('Continue advances a read step', async ({ page }) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);

  await expect(page.getByTestId('lesson-progress')).toHaveText(`1 / ${CHESS_L01.steps.length}`);
  await page.getByTestId('coach-continue').click();

  await expect(page.getByTestId('lesson-progress')).toHaveText(`2 / ${CHESS_L01.steps.length}`);
  await expect(page.getByTestId('coach-say')).toHaveText(CHESS_L01.steps[1].instruction);
});

test('a right move is praised, and the next instruction takes over the task line', async ({
  page,
}) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);
  await page.getByTestId('coach-continue').click();

  await playChess(page, 'e2', 'e4');

  await expect(page.getByTestId('coach-card')).toHaveAttribute('data-say-kind', 'success');
  await expect(page.getByTestId('coach-say')).toHaveText(CHESS_L01.steps[1].success!);
  await expect(page.getByTestId('coach-task')).toContainText(CHESS_L01.steps[2].instruction);
});

test('a wrong move gets the AUTHORED line and leaves the board where it was', async ({ page }) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);
  await page.getByTestId('coach-continue').click();

  // A knight move on the "push a pawn" step — a mistake this lesson names.
  await playChess(page, 'g1', 'f3');

  const authored = CHESS_L01.steps[1].misses!.find((m) => m.match?.piece === 'knight')!.say;
  await expect(page.getByTestId('coach-card')).toHaveAttribute('data-say-kind', 'miss');
  await expect(page.getByTestId('coach-say')).toHaveText(authored);

  // Still on the same step. Unlike a puzzle, a lesson never plays the wrong
  // move out — g1 still has its knight, and no refutation search ran.
  await expect(page.getByTestId('lesson-progress')).toHaveText(`2 / ${CHESS_L01.steps.length}`);
  await expect(page.locator('.piece-layer [data-square="g1"]:not([data-fading])')).toHaveCount(1);
  await expect(page.locator('.piece-layer [data-square="f3"]:not([data-fading])')).toHaveCount(0);

  // And the learner can answer again straight away.
  await playChess(page, 'd2', 'd4');
  await expect(page.getByTestId('coach-card')).toHaveAttribute('data-say-kind', 'success');
});

test('the hint marks a move without ending the step', async ({ page }) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);
  await page.getByTestId('coach-continue').click();

  await page.getByTestId('coach-hint-button').click();
  await expect(page.getByTestId('coach-hint-button')).toHaveText('Hint shown');
  // The step is still open — a hint is a nudge, not an answer.
  await expect(page.getByTestId('lesson-progress')).toHaveText(`2 / ${CHESS_L01.steps.length}`);
});

test('finishing a lesson offers the next one, and the progress survives a reload', async ({
  page,
}) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);

  await page.getByTestId('coach-continue').click();
  await playChess(page, 'e2', 'e4');
  // Wait for black's scripted reply to land. The board is deliberately inert
  // through the beat, so clicking into it here would do nothing at all — and
  // would read as the knight move being rejected.
  await expect(page.getByTestId('coach-task')).toContainText(CHESS_L01.steps[2].instruction);
  await playChess(page, 'g1', 'f3');
  await page.getByTestId('coach-continue').click();

  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await expect(page.getByTestId('coach-card')).toHaveAttribute('data-say-kind', 'outro');
  await expect(page.getByTestId('coach-say')).toHaveText(CHESS_L01.outro);
  await expect(page.getByTestId('lesson-next')).toContainText(LESSONS.chess.lessons[1].title);

  const stored = await page.evaluate((key) => localStorage.getItem(key), WEB_LESSON_PROGRESS_KEY);
  expect(stored).toContain(CHESS_L01.id);

  // Back on the index, as a guest, the lesson reads as done.
  await page.goto('/chess/learn');
  await expect(page.getByTestId('lesson-done-badge').first()).toBeVisible();
});

test('a lesson page title carries the product name', async ({ page }) => {
  // These titles once shipped naming an unmerged rebrand, which no other page
  // did. Every game's first lesson, so a per-game copy of the string can't drift.
  for (const [game, set] of Object.entries(LESSONS)) {
    const first = set.lessons[0];
    await page.goto(`/${game}/learn/${first.id}`);
    const escaped = first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page).toHaveTitle(new RegExp(`^${escaped} — .* — GameExplorer$`));
  }
});

test('an unknown lesson id is a 404, not a broken screen', async ({ page }) => {
  const response = await page.goto('/chess/learn/chess-l99');
  expect(response?.status()).toBe(404);
});

test('every game with lessons serves its first one', async ({ page }) => {
  for (const [game, set] of Object.entries(LESSONS)) {
    const first = set.lessons[0];
    await page.goto(`/${game}/learn/${first.id}`);
    // Generous, like the other load-sensitive waits in this suite: the lesson
    // screen shows a skeleton until `useLesson` resolves, and each game's first
    // lesson is a route the dev server may be compiling for the first time while
    // the rest of the suite runs in parallel. Five seconds was not always enough.
    await expect(page.getByTestId('coach-say')).toHaveText(first.steps[0].instruction, {
      timeout: 15000,
    });
  }
});

test('a lesson renders as a board screen, not under the global navbar', async ({ page }) => {
  await page.goto(`/chess/learn/${CHESS_L01.id}`);
  await expect(page.getByTestId('lesson-progress')).toBeVisible();

  // `isImmersiveGameRoute` has to match a lesson: it renders GameScreenLayout,
  // which starts at the top of the viewport and reserves nothing for the fixed
  // navbar. When the two disagreed, the navbar was painted over the top ~64px
  // of the shell — its header and the top of the board.
  await expect(page.locator('nav')).toHaveCount(0);

  const header = page.getByTestId('lesson-progress');
  expect((await header.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);

  // The index that lists the lessons is an ordinary page and keeps its nav —
  // the top bar, and the phone bar that CSS hides at this width.
  await page.goto('/chess/learn');
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
});
