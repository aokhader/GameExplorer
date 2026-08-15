import { test, expect, type Page } from '@playwright/test';

// Flipping the board is a VIEW change. Web had no flip control during play at
// all (only the analysis page had one), and the boards conflated "which way am
// I looking" with "which side do I own" in a single `playerColor` prop — so the
// obvious implementation, passing the other colour, would have handed the
// player the bot's pieces. Orientation is now its own prop; these tests pin
// both halves of that.

/** File labels along the bottom edge, left to right. */
function fileLabels(page: Page) {
  return page.locator('.chess-board .file-label');
}

async function startBotGame(page: Page) {
  await page.goto('/chess/bot?elo=600&start=1');
  await expect(page.locator('.chess-board')).toBeVisible();
}

test('flip turns the board around', async ({ page }) => {
  await startBotGame(page);

  // Playing White: a-file on the left.
  await expect(fileLabels(page)).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(fileLabels(page)).toHaveText(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);

  // …and back.
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(fileLabels(page)).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

/**
 * DOM index of a square when the board is FLIPPED (Black at the bottom).
 *
 * The board emits 64 squares row-major. Flipped, the top-left is h1 and rank
 * grows downward, so `rank - 1` is the row and `7 - file` the column — the
 * mirror of the White-at-bottom mapping used elsewhere in these specs.
 */
function flippedIndex(square: string): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return (rank - 1) * 8 + (7 - file);
}

test('flipping does not hand the player the opponent’s pieces', async ({ page }) => {
  await startBotGame(page);
  await page.getByRole('button', { name: 'Flip board' }).click();

  const squares = page.locator('.chess-board > .square');
  const indicators = page.locator('.chess-board .move-indicator');

  // Sanity-check the mapping first, so the assertions below can't pass by
  // landing on an empty square: e7 must actually hold a black pawn.
  await expect(page.locator('.piece-layer [data-square="e7"]:not([data-fading])')).toBeVisible();

  // A black piece offers nothing — it is White to move and White is still the
  // player's side, whichever way the board is facing.
  await squares.nth(flippedIndex('e7')).click();
  await expect(indicators).toHaveCount(0);

  // The player's own pawn still moves.
  await squares.nth(flippedIndex('e2')).click();
  await expect(indicators.first()).toBeVisible();
});
