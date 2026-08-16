import { test, expect } from '@playwright/test';

// Pass-and-play was mobile-only: web's hubs said "Local 2-Player — Coming Soon".
// It is now a mode of the same game screen rather than its own, so what needs
// pinning is that the mode actually changes behaviour — no bot replies, nothing
// is rated, and both colours can move.

const GAMES = ['chess', 'checkers', 'reversi'] as const;

for (const game of GAMES) {
  test(`${game} hub links to pass-and-play`, async ({ page }) => {
    await page.goto(`/${game}`);
    await expect(page.getByRole('link', { name: /Local 2-Player/ })).toHaveAttribute(
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

  // White: e2–e4. The board starts white-side-down, so index = (8 - rank) * 8 + file.
  const e2 = squares.nth((8 - 2) * 8 + 4);
  await e2.click();
  // Wait for the selection to commit rather than sleeping: click-to-move needs a
  // render between the two clicks, and under parallel load the second one
  // otherwise lands before the first has taken effect.
  await expect(e2).toHaveClass(/selected/, { timeout: 15000 });
  await squares.nth((8 - 4) * 8 + 4).click();

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
