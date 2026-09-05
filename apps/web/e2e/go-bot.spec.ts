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

test('two passes open the review, and accepting it scores the board', async ({ page }) => {
  // Driven from pass-and-play so both passes are ours: against a bot this would
  // need a full game, since a bot that is behind correctly refuses to pass.
  await page.goto('/go/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-legal]')).toHaveCount(81);

  const pass = page.getByRole('button', { name: 'Pass', exact: true });

  // A pass is a move: it goes on the timeline and hands the turn over.
  await pass.click();
  await expect(page.getByText('Pass').first()).toBeVisible();

  // The second pass stops the game without ending it. No result screen yet —
  // a score nobody has agreed to must not be announced, let alone saved.
  await pass.click();
  const review = page.getByTestId('go-marking-panel');
  await expect(review).toBeVisible();
  await expect(page.getByText(/White by 7\.5/)).toHaveCount(1);

  await page.getByRole('button', { name: 'Accept score' }).click();
  await expect(page.getByText(/Black 0 · White 7\.5/)).toBeVisible();
});

test('the review can be disputed, and the game carries on', async ({ page }) => {
  await page.goto('/go/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  const pass = page.getByRole('button', { name: 'Pass', exact: true });
  await pass.click();
  await pass.click();
  await expect(page.getByTestId('go-marking-panel')).toBeVisible();

  await page.getByRole('button', { name: 'Resume play' }).click();
  await expect(page.getByTestId('go-marking-panel')).toHaveCount(0);
  // Back on the board with every point playable, and the pass count forgotten:
  // one further pass must not end the game again.
  await expect(page.locator('[data-legal]')).toHaveCount(81);
  await pass.click();
  await expect(page.getByTestId('go-marking-panel')).toHaveCount(0);
});

test('the rules card sets komi and scoring, and a non-standard komi is casual', async ({ page }) => {
  await page.goto('/go/bot');
  await expect(page.getByText('9×9 · area scoring · 7.5 komi to white')).toBeVisible();

  // `exact`, because the Strong bot tier's description also says "territory".
  await page.getByRole('button', { name: 'Territory', exact: true }).click();
  await expect(page.getByText('9×9 · territory scoring · 7.5 komi to white')).toBeVisible();

  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(page.getByText('9×9 · territory scoring · no komi')).toBeVisible();
  await expect(page.getByText(/Games away from 7\.5 komi are casual/)).toBeVisible();

  // The chosen ruleset reaches the game, not just the setup screen.
  await page.getByRole('button', { name: 'Start Game' }).click();
  const info = page.locator('text=Scoring:').locator('..');
  await expect(info).toContainText('territory');
  await expect(page.locator('text=Komi:').locator('..')).toContainText('none');
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

test('the board size picker reaches the game, and only 9×9 stays rated', async ({ page }) => {
  /*
   * The size has to reach the BOARD, not just the summary line. The last Go
   * pass shipped a bug of exactly this shape: `useLocalGame` builds its first
   * position in a `useState` initialiser, which runs once, and the setup screen
   * and the board are the same component — so a ruleset chosen after mount was
   * silently discarded and the game began under the defaults. Counting the
   * points on the board is the assertion that would have caught it.
   */
  await page.goto('/go/bot');
  await expect(page.getByText('9×9 · area scoring · 7.5 komi to white')).toBeVisible();

  await page.getByRole('button', { name: '13×13', exact: true }).click();
  await expect(page.getByText('13×13 · area scoring · 7.5 komi to white')).toBeVisible();
  await expect(page.getByText(/Only 9×9 games are rated/)).toBeVisible();

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-legal]')).toHaveCount(169);
});

test('19×19 is offered and playable', async ({ page }) => {
  await page.goto('/go/local');
  await page.getByRole('button', { name: '19×19', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('[data-legal]')).toHaveCount(361);

  // A stone goes down on the big board like any other.
  await page.locator('[data-legal]').first().click();
  await expect(page.locator('[data-legal]')).toHaveCount(360);
});
