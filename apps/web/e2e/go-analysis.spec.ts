import { test, expect } from '@playwright/test';

/*
 * Go's analysis page: paste a game in as SGF and walk it.
 *
 * SGF is Go's FEN with one difference that shapes the page — a FEN is a
 * position and an SGF is a whole game — so what is asserted here is the walk:
 * the file's own ruleset, its moves in Go's coordinates, and a board that
 * actually changes when you step back through it.
 */

const GAME = '(;FF[4]GM[1]SZ[19]KM[6.5]RU[Japanese];B[pd];W[dp];B[qp];W[dd])';

test('the Go hub offers the analysis board', async ({ page }) => {
  await page.goto('/go');
  await page.getByRole('link', { name: /Analysis board/ }).click();
  await expect(page.getByLabel('SGF')).toBeVisible();
});

test('an SGF is loaded, read in Go coordinates, and stepped through', async ({ page }) => {
  await page.goto('/go/analysis');

  await page.getByLabel('SGF').fill(GAME);
  await page.getByRole('button', { name: 'Analyze game' }).click();

  // The file's ruleset, not a default: a game imported at the wrong size looks
  // entirely plausible and is not the game anyone played.
  await expect(page.getByText('19×19 · territory scoring · 6.5 komi to white')).toBeVisible();

  // SGF's `pd` is the point a player calls Q16 — three coordinate systems meet
  // here (file, engine, display) and only the last belongs on screen.
  await expect(page.getByRole('button', { name: /Q16/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /D16/ })).toBeVisible();

  const stones = page.locator('[data-stone]');
  await expect(stones).toHaveCount(4);
  await expect(page.getByText('4 / 4')).toBeVisible();

  // Stepping back is the whole point of a review, and it must move the board —
  // not just the counter.
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(stones).toHaveCount(3);

  await page.getByRole('button', { name: 'First' }).click();
  await expect(stones).toHaveCount(0);
  await expect(page.getByText('0 / 4')).toBeVisible();

  // And a move in the list jumps straight to the position it produced.
  await page.getByRole('button', { name: /Q16/ }).click();
  await expect(stones).toHaveCount(1);
});

test('a file that cannot be read is refused rather than guessed at', async ({ page }) => {
  await page.goto('/go/analysis');
  const box = page.getByLabel('SGF');
  const load = page.getByRole('button', { name: 'Analyze game' });

  // No SZ. Assuming 9×9 would import a 19×19 game as a truncated 9×9 one that
  // looks entirely reasonable, so the parser refuses instead.
  await box.fill('(;FF[4]GM[1];B[pd])');
  await load.click();
  await expect(page.getByText(/no board size/)).toBeVisible();

  await box.fill('not an sgf at all');
  await load.click();
  await expect(page.getByText(/Not an SGF file/)).toBeVisible();

  // Parses cleanly and is still useless: review grades moves, and there are none.
  await box.fill('(;FF[4]GM[1]SZ[19]KM[6.5])');
  await load.click();
  await expect(page.getByText(/no moves to review/)).toBeVisible();

  // Nothing was loaded on any of those, so the paste box is still the page.
  await expect(box).toBeVisible();
});
