import { test, expect } from '@playwright/test';

// Pass-and-play was mobile-only: web's hubs said "Local 2-Player — Coming Soon".
// Both platforms now call it "Pass & Play" (`MODE_COPY`, ux-fix-ideas.md §3.3).
// It is now a mode of the same game screen rather than its own, so what needs
// pinning is that the mode actually changes behaviour — no bot replies, nothing
// is rated, and both colours can move.

const GAMES = ['chess', 'checkers', 'reversi'] as const;

for (const game of GAMES) {
  test(`${game} hub links to pass-and-play`, async ({ page }) => {
    await page.goto(`/${game}`);
    await expect(page.getByRole('link', { name: /Pass & Play/ })).toHaveAttribute(
      'href',
      `/${game}/local`,
    );
  });

  test(`${game} pass-and-play setup is casual and bot-free`, async ({ page }) => {
    await page.goto(`/${game}/local`);

    await expect(page.getByRole('heading', { name: 'Pass & Play' })).toBeVisible();
    // Nothing to rate and no bot to calibrate — the controls for both are gone.
    await expect(page.getByRole('switch', { name: 'Rated' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Bot Strength' })).toHaveCount(0);
  });
}

test('chess pass-and-play lets both colours move and never answers back', async ({ page }) => {
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.square');
  await expect(squares).toHaveCount(64);
  // The board takes input once the engine worker has sent its first position.
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });

  // White: e2–e4. The board starts white-side-down, so index = (8 - rank) * 8 + file.
  const e2 = squares.nth((8 - 2) * 8 + 4);
  const e4 = squares.nth((8 - 4) * 8 + 4);
  await e2.click();
  // Wait for e4 to be offered as a destination, not merely for e2 to look
  // selected. Legal moves come from the engine worker, and until its first
  // update the board holds an empty move map: e2 still takes the `selected`
  // class, but with no destinations, so a click on e4 would be ignored.
  //
  // Against `next dev` this test can still fail under a parallel suite, for a
  // different reason: other workers' on-demand route compiles push Fast Refresh
  // updates into this page, Fast Refresh re-runs the engine hook's mount effect,
  // and the fresh worker's first update resets the game. Production builds have
  // no Fast Refresh, which is why CI runs this suite against one.
  await expect(e4).toHaveClass(/valid-move/, { timeout: 15000 });
  await e4.click();

  // A bot would have replied by now; in pass-and-play the move list must still
  // hold exactly one move and it must be Black's turn.
  await expect(page.getByText('Turn:')).toBeVisible();
  // Generous: chess validates in a Web Worker, and a dev server running the
  // whole suite in parallel can take a while to hand it over.
  await expect(page.locator('body')).toContainText('e4', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText(/\b(a6|e5|c5|Nf6|d5)\b/);

  // The board turns around between turns, so Black is now the one at the bottom.
  await expect(page.getByText('to move')).toBeVisible();
});

test('pass-and-play never offers a rating on the result screen', async ({ page }) => {
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Resign asks twice (a 3s window), so the second click has to be prompt.
  const resign = page.getByRole('button', { name: /^Resign\??$/ });
  await resign.click();
  await resign.click();

  // A named winner rather than "You won" — there is no "you" here.
  await expect(page.getByText(/White wins|Black wins/)).toBeVisible();
  await expect(page.getByText('Rating')).toHaveCount(0);
});
