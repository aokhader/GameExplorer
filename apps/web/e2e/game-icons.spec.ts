import { test, expect } from '@playwright/test';

/**
 * Game identity icons.
 *
 * Web used to carry five separate glyph maps that disagreed with each other —
 * chess was ♔, ♞ or ♟ depending on the page — plus inline literals on every hub
 * hero. They all now route through `GameIcon` over the same `@gameexplorer/ui`
 * art mobile draws. Nothing else would notice if one surface drifted back to a
 * glyph, so these assert on the rendered art itself.
 */

const ART: Record<string, string> = {
  chess: 'white knight',
  checkers: 'white king',
  reversi: 'black disc',
  go: 'white stone',
  liquidate: 'planet',
};

test('every game on the landing page draws its shared vector art, not a glyph', async ({ page }) => {
  await page.goto('/');

  for (const [game, label] of Object.entries(ART)) {
    const name = game[0].toUpperCase() + game.slice(1);
    const tile = page.getByRole('button', { name, exact: true });
    await expect(tile.locator(`svg[aria-label="${label}"]`)).toBeVisible();
  }

  // The glyphs these replaced. Any one reappearing means a map came back.
  // Alternation with the `u` flag, not a character class: 🔴 and 🪐 are astral,
  // and a class would match half a surrogate pair — which the page's ordinary
  // emoji (📱 📊 🎓) then trip, failing on content that was never a game icon.
  await expect(page.locator('body')).not.toContainText(/♔|♞|♟|⛃|⛀|⚪|🔴|🪐|◑/u);
});

for (const [game, label] of Object.entries(ART)) {
  test(`${game} hub hero and tutorial draw the same art as the home tile`, async ({ page }) => {
    await page.goto(`/${game}`);
    await expect(page.locator(`svg[aria-label="${label}"]`).first()).toBeVisible();

    await page.goto(`/${game}/learn`);
    await expect(page.locator(`main svg[aria-label="${label}"]`).first()).toBeVisible();
  });
}

/**
 * Quiet Arcade (ux-fix-ideas.md §6.1, §6.4): a game is identified by its piece
 * art and its name, not by a glow, a route-wide wash or an aurora. Those used
 * to be the per-game identity — and the thing that went wrong with them was a
 * newer game silently wearing an older one's (Go glowed reversi lime). The art
 * test above now carries that check; this one holds the decoration out.
 */
const DECORATION = [
  '[class*="shadow-glow"]',
  '[class*="page-glow"]',
  '[class*="gradient-accent"]',
  '.animate-aurora',
  '.animate-float',
  '.glass',
].join(', ');

for (const route of ['/', '/go', '/liquidate', '/chess/bot', '/welcome']) {
  test(`${route} paints no glow, wash, glass or aurora`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator(DECORATION)).toHaveCount(0);
  });
}

test('go and liquidate hubs lead with their own name and piece art', async ({ page }) => {
  for (const [game, name] of [['go', 'Go'], ['liquidate', 'Liquidate']] as const) {
    await page.goto(`/${game}`);
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name }) });
    await expect(header.locator(`svg[aria-label="${ART[game]}"]`)).toBeVisible();
  }
});
