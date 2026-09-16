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
    await page.goto(path);
    await expect(page.locator('nav')).toHaveCount(0);
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}
