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
