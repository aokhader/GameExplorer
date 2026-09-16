import { test, expect } from '@playwright/test';

test('home page renders and links to all three games', async ({ page }) => {
  // A brand-new guest is redirected to the /welcome tour — mark this browser
  // as already onboarded so we land on the home page itself.
  await page.addInitScript(() => localStorage.setItem('ge:onboarded', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GameExplorer' })).toBeVisible();
  for (const game of ['chess', 'checkers', 'reversi']) {
    await expect(page.locator(`a[href="/${game}"]`).first()).toBeVisible();
  }
});

for (const game of ['chess', 'checkers', 'reversi'] as const) {
  test(`${game} landing page shows the three play modes`, async ({ page }) => {
    await page.goto(`/${game}`);
    await expect(page.getByText('Play vs Bot')).toBeVisible();
    await expect(page.getByText('Training Mode')).toBeVisible();
    await expect(page.getByText('Online Multiplayer')).toBeVisible();
    // Bot mode is reachable from the card.
    await expect(page.locator(`a[href="/${game}/bot"]`).first()).toBeVisible();
    // The How to Play tutorial is reachable from the hub.
    await expect(page.locator(`a[href="/${game}/learn"]`).first()).toBeVisible();
  });

  test(`${game} tutorial page renders rules, diagrams and the bot CTA`, async ({ page }) => {
    await page.goto(`/${game}/learn`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('How to Play');
    // Every diagram is a <figure> with a 64-cell board grid.
    const boards = page.locator('figure [role="img"]');
    expect(await boards.count()).toBeGreaterThan(2);
    await expect(page.getByText('Beginner tips')).toBeVisible();
    await expect(page.locator(`a[href="/${game}/bot"]`).first()).toBeVisible();
  });
}

// Go and Liquidate had no tutorial smoke coverage at all — the loop above was
// written for the three 8x8 games and never widened. Go's board is not a grid
// of squares and Liquidate has no diagrams, so they get the shape of the same
// check rather than the check itself.
for (const game of ['go', 'liquidate'] as const) {
  test(`${game} tutorial page renders rules and the play CTA`, async ({ page }) => {
    await page.goto(`/${game}/learn`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('How to Play');
    await expect(page.getByText('Beginner tips')).toBeVisible();
    await expect(page.locator(`a[href="/${game}/bot"]`).first()).toBeVisible();
  });
}

test('the Go tutorial draws its diagrams, including the counted board', async ({ page }) => {
  await page.goto('/go/learn');
  const boards = page.locator('figure [role="img"]');
  expect(await boards.count()).toBeGreaterThan(2);

  // The section the rewrite exists for: a board where every point is shaded
  // with the side it counts for, and the count spelled out beside it.
  await expect(page.getByRole('heading', { name: 'Counting the board' })).toBeVisible();
  await expect(page.getByText(/Black 36, White 43\.5/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Two ways to count/ })).toBeVisible();
});

// Every game's hub ends with the same rules panel and the same way into its
// guide. Chess used to have no panel, and three of the five that did dead-ended
// with no link out.
for (const game of ['chess', 'checkers', 'reversi', 'go', 'liquidate'] as const) {
  test(`${game} hub explains the rules and links to the guide`, async ({ page }) => {
    await page.goto(`/${game}`);
    const panel = page.getByTestId('how-it-works');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'How It Works' })).toBeVisible();

    const guide = page.getByTestId('how-it-works-guide');
    await expect(guide).toHaveAttribute('href', `/${game}/learn`);
    // A link people are meant to tap, not a 20px line of text.
    expect((await guide.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}

// The board screens render no global navbar, so the shell's own header is the
// only navigation there is — and until this landed it could only reach the
// game's hub, leaving home two clicks away.
for (const path of ['/chess/bot', '/chess/puzzles', '/chess/analysis', '/liquidate/bot']) {
  test(`${path} can get home in one click`, async ({ page }) => {
    // `domcontentloaded`, not `load`: the analysis route pulls the engine's wasm
    // on the way in, and waiting for it once cost this test a 30s navigation
    // timeout under four parallel workers. The header is server-rendered.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav')).toHaveCount(0);
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('the chess board is oriented a1-dark, h1-light', async ({ page }) => {
  await page.goto('/chess/puzzles');
  const squares = page.locator('.chess-board > .square');
  await squares.first().waitFor();

  // Squares render top-left first, so a8 is 0, a1 is 56 and h1 is 63. "Light on
  // the right" is the orientation every printed board uses, and the one the
  // puzzle explanations assume when they say light-squared bishop.
  await expect(squares.nth(56)).toHaveClass(/dark/);
  await expect(squares.nth(63)).toHaveClass(/light/);
  await expect(squares.nth(0)).toHaveClass(/light/);
  await expect(squares.nth(7)).toHaveClass(/dark/);
});

test('the checkers board is oriented a1-dark, with play on the dark squares', async ({ page }) => {
  await page.goto('/checkers/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Pieces carry their own square, so the opening position can be read straight
  // off the board. On an a1-dark board the playable squares are the ones whose
  // coordinates sum to an even number, and White's back rank is a1, c1, e1, g1.
  const squares = await page
    .locator('[data-square]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.square!));

  expect(squares).toHaveLength(24);
  for (const square of squares) {
    const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = Number(square[1]) - 1;
    expect((row + col) % 2, `${square} is a light square`).toBe(0);
  }
  expect(squares).toContain('a1');
  expect(squares).not.toContain('b1');
});
