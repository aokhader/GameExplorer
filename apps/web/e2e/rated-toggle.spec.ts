import { test, expect } from '@playwright/test';

// Bot games used to disagree about ratings: chess never wrote one, checkers and
// reversi always did for a signed-in player, and mobile offered an explicit
// choice. All three web pages now carry the same switch, named for what it
// moves: "Update Practice Level".
//
// These tests are unauthenticated (see playwright.config.ts), so they pin the
// signed-out contract: the control is present on every bot page, off, inert, and
// says why. The signed-in half — flipping it, and the rating write it gates —
// needs a real session and is covered manually.

const BOT_PAGES = [
  { game: 'chess', path: '/chess/bot' },
  { game: 'checkers', path: '/checkers/bot' },
  { game: 'reversi', path: '/reversi/bot' },
] as const;

for (const { game, path } of BOT_PAGES) {
  test(`${game} bot setup offers the practice switch, disabled for guests`, async ({ page }) => {
    await page.goto(path);

    const rated = page.getByRole('switch', { name: 'Update Practice Level' });
    await expect(rated).toBeVisible();
    await expect(rated).toHaveAttribute('aria-checked', 'false');
    await expect(rated).toBeDisabled();

    // A disabled control with no explanation reads as a bug.
    await expect(page.getByText('Sign in to play rated games')).toBeVisible();
  });
}

test('the practice switch does not block starting a casual game', async ({ page }) => {
  await page.goto('/chess/bot');
  await page.getByRole('button', { name: 'Start Game' }).click();
  // Reaching the board means the setup screen still hands off with Rated off.
  // A game this young offers Abort rather than Resign.
  await expect(page.getByRole('button', { name: 'Abort' })).toBeVisible();
});
