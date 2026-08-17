import { test, expect } from '@playwright/test';

// Full in-browser game flow for Go against the weakest bot: setup → start →
// alternating player/bot stones on the real board component. This is the only
// gate that exercises GoBoard's intersection geometry, the shared useLocalGame
// loop driving a web screen for the first time, and the MCTS bot running
// time-sliced in a browser bundle.

test('plays the opening of a bot game as black', async ({ page }) => {
  await page.goto('/go/bot');

  await page.getByRole('button', { name: /Beginner/ }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const stones = page.locator('[data-stone]');
  const legal = page.locator('[data-legal]');

  // An empty 9x9: no stones, and every one of the 81 points is playable.
  await expect(stones).toHaveCount(0);
  await expect(legal).toHaveCount(81);

  // Three rounds: we place, the bot replies. Two stones per round, and unlike
  // reversi a Go stone count can also FALL — hence the explicit lower bound
  // rather than an equality.
  for (let round = 1; round <= 3; round++) {
    await legal.first().click();
    await expect
      .poll(() => stones.count(), {
        timeout: 30_000,
        message: `round ${round}: waiting for the player stone and the bot's reply`,
      })
      .toBeGreaterThanOrEqual(round * 2);
  }

  // The move list records both sides in Go coordinates (the file letters skip I).
  await expect(page.getByText('Moves')).toBeVisible();
  await expect(legal.first()).toBeVisible(); // our turn again — the game is alive
});

test('two passes end the game and the board is scored', async ({ page }) => {
  // Driven from pass-and-play so both passes are ours: against a bot this would
  // need a full game, since a bot that is behind correctly refuses to pass.
  await page.goto('/go/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-legal]')).toHaveCount(81);

  const pass = page.getByRole('button', { name: 'Pass', exact: true });

  // A pass is a move: it goes on the timeline and hands the turn over.
  await pass.click();
  await expect(page.getByText('Pass').first()).toBeVisible();

  // The second pass ends the game. An empty board is all neutral, so white wins
  // on komi alone — and the result screen has to say so in points.
  await pass.click();
  await expect(page.getByText(/Two passes — White by 7\.5/)).toBeVisible();
  await expect(page.getByText(/Black 0 · White 7\.5/)).toBeVisible();
});

test('New Game returns to the setup screen', async ({ page }) => {
  await page.goto('/go/bot');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-legal]')).toHaveCount(81);

  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('pass-and-play seats both colours on one screen', async ({ page }) => {
  await page.goto('/go/local');
  await expect(page.getByRole('heading', { name: 'Pass & Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const legal = page.locator('[data-legal]');
  await expect(legal).toHaveCount(81);

  // Black plays, and the board immediately offers white's moves — no bot, so
  // the turn passes straight to the other human.
  await legal.first().click();
  await expect(page.locator('[data-stone]')).toHaveCount(1);
  await expect(legal).toHaveCount(80);
});
