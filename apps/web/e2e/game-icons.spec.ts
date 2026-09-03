import { test, expect } from '@playwright/test';

/**
 * Game identity icons.
 *
 * Web used to carry five separate glyph maps that disagreed with each other —
 * chess was ♔, ♞ or ♟ depending on the page — plus inline literals on every hub
 * hero. They all now route through `GameIcon` over the same `@finesse/ui`
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

test('every home tile draws its shared vector art, not a glyph', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ge:onboarded', '1'));
  await page.goto('/');

  for (const [game, label] of Object.entries(ART)) {
    const card = page.locator(`a[href="/${game}"]`).filter({ has: page.locator('svg') }).first();
    await expect(card.locator(`svg[aria-label="${label}"]`)).toBeVisible();
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

test('the Go card wears its own glow, not reversi lime', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ge:onboarded', '1'));
  await page.goto('/');

  // The glow ternary this replaced ended in an `else` meaning reversi, so Go —
  // added later — silently inherited it.
  // The glow lives on the card div INSIDE the anchor, not the anchor itself.
  const goCard = page
    .locator('a[href="/go"]')
    .filter({ has: page.locator('svg[aria-label="white stone"]') })
    .locator('div[class*="shadow-glow"]')
    .first();
  const cls = await goCard.getAttribute('class');
  expect(cls).toContain('--shadow-glow-go');
  expect(cls).not.toContain('--shadow-glow-reversi');
});

test('go and liquidate hubs get their own ambient hue and hero treatment', async ({ page }) => {
  for (const game of ['go', 'liquidate']) {
    await page.goto(`/${game}`);
    // `animate-aurora` is applied only on hero routes; the hue comes from the
    // per-game glow var. Both used to fall back to the gold brand default.
    const auroras = page.locator('.animate-aurora');
    await expect(auroras.first()).toBeVisible();
    const styles = await auroras.evaluateAll((els) => els.map((e) => e.getAttribute('style') ?? ''));
    expect(styles.some((s) => s.includes(`--c-game-${game}-glow`))).toBe(true);
  }
});
