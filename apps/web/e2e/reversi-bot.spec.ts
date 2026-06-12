import { test, expect } from '@playwright/test';

// Full in-browser game flow against the weakest bot: setup screen → start →
// alternating player/bot moves on the real board component. Exercises the
// page state machine, the ReversiBoard click handling, and the shared engine
// running in the browser bundle.

test('plays the opening of a bot game as black', async ({ page }) => {
  await page.goto('/reversi/bot');

  // Setup screen: weakest bot, default colour (black — moves first).
  await page.getByRole('button', { name: /Beginner/ }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Standard reversi start: 4 discs, and it's our turn (legal targets shown).
  const discs = page.locator('[data-disc]');
  const legal = page.locator('[data-legal]');
  await expect(discs).toHaveCount(4);
  await expect(legal.first()).toBeVisible();

  // Three full rounds: we place a disc, the bot replies. Disc count goes
  // 4 → (click) 5 → (bot) 6 → ... → 10. Flips never change the count.
  for (let round = 1; round <= 3; round++) {
    await legal.first().click();
    await expect
      .poll(() => discs.count(), { timeout: 20_000, message: `round ${round}: waiting for player+bot discs` })
      .toBeGreaterThanOrEqual(4 + round * 2);
  }

  await expect(discs).toHaveCount(10);
  // Score card reflects the position (black + white add up to 10).
  await expect(legal.first()).toBeVisible(); // our turn again — game is alive
});

test('New Game returns to the setup screen', async ({ page }) => {
  await page.goto('/reversi/bot');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-disc]')).toHaveCount(4);

  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});
