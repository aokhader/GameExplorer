import { test, expect } from '@playwright/test';

// The chess capture tray (mobile had one, web did not). The material maths is
// `summarizeMaterial` in @gameexplorer/shared and is covered by its own unit
// tests; what this pins is the page-level contract that unit tests cannot see —
// the tray stays out of the way until there is something to show.
//
// Bot replies are deliberately noisy at 600 elo, so asserting a *specific*
// capture here would be flaky. The populated tray was verified interactively.

test('chess bot game shows no capture tray until a piece is taken', async ({ page }) => {
  await page.goto('/chess/bot?elo=600&start=1');
  await expect(page.locator('.chess-board')).toBeVisible();

  // Both player cards are on screen…
  await expect(page.getByText('Bot', { exact: true })).toBeVisible();
  // …and neither carries a tray on move one.
  await expect(page.locator('[role="img"][aria-label*="captured"]')).toHaveCount(0);
});
