import { test, expect, type Page } from '@playwright/test';

/**
 * `project-docs/ux-fix-ideas.md` §2.1 and §2.4 on web: a second visit costs less
 * than the first, and closing the tab mid-game no longer loses the game.
 *
 * Every test runs in a fresh browser context, so storage starts empty; the
 * ones about resuming seed a saved game the way the screens write it.
 */

const PASS_AND_PLAY_CHESS = {
  v: 1,
  game: 'chess',
  mode: 'pass-and-play',
  userId: null,
  rated: false,
  playerColor: 'white',
  botElo: 1200,
  setup: { elo: 1200, color: 'white', rated: true, custom: false },
  actions: [
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'g1', to: 'f3' },
  ],
  hintsUsed: 0,
  startedAt: 1,
  savedAt: 2,
};

async function seed(page: Page, key: string, value: unknown) {
  await page.addInitScript(
    ([k, v]) => {
      // Once per context: a reload must see what the page itself wrote since.
      if (!sessionStorage.getItem('seeded:' + k)) {
        localStorage.setItem(k, v);
        sessionStorage.setItem('seeded:' + k, '1');
      }
    },
    [key, JSON.stringify(value)] as const,
  );
}

test('chess vs bot reopens on the strength and colour chosen last time', async ({ page }) => {
  await page.goto('/chess/bot');
  await page.getByRole('button', { name: /^2000/ }).click();
  await page.getByRole('button', { name: /Black/ }).click();

  await page.reload();
  // The big strength readout, and the colour tile carrying the selected style.
  await expect(page.locator('.font-display', { hasText: /^2000$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Black/ })).toHaveClass(/bg-accent/);
});

test('a strength between the presets is remembered exactly', async ({ page }) => {
  await page.goto('/chess/bot');
  // By role: React's streamed hidden copy of the page holds a second range input.
  await page.getByRole('slider').fill('1325');

  await page.reload();
  await expect(page.locator('.font-display', { hasText: /^1325$/ })).toBeVisible();
});

test('Go remembers the board size and komi per mode', async ({ page }) => {
  await page.goto('/go/local');
  await page.getByRole('button', { name: /^13×13/ }).click();

  await page.reload();
  await expect(page.getByText(/13×13 · area scoring/)).toBeVisible();

  // The bot form has its own memory, still on the rated default.
  await page.goto('/go/bot');
  await expect(page.getByText(/9×9 · area scoring · 7\.5 komi/)).toBeVisible();
});

test('a pass-and-play chess game survives a reload and resumes where it was', async ({ page }) => {
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.square');
  await expect(squares).toHaveCount(64);
  // The board takes input once the engine worker has sent its first position.
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  const e2 = squares.nth((8 - 2) * 8 + 4);
  const e4 = squares.nth((8 - 4) * 8 + 4);
  await e2.click();
  await expect(e4).toHaveClass(/valid-move/, { timeout: 15000 });
  await e4.click();
  await expect(page.locator('body')).toContainText('e4', { timeout: 15000 });

  // Closing the tab mid-game.
  await page.reload();
  const card = page.getByRole('region', { name: 'Unfinished game' });
  await expect(card).toContainText('Game in progress');
  await expect(card).toContainText('Pass & Play · move 1');

  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.square')).toHaveCount(64);
  await expect(page.locator('body')).toContainText('e4', { timeout: 15000 });
  // Black to move: the game carried on rather than starting over.
  await expect(page.getByText('to move')).toBeVisible();
});

test('a saved game from another mode resumes on its own route', async ({ page }) => {
  await seed(page, 'gx:inprogress:chess:guest', PASS_AND_PLAY_CHESS);
  await page.goto('/chess/bot');

  const card = page.getByRole('region', { name: 'Unfinished game' });
  await expect(card).toContainText('Pass & Play · move 2');
  await card.getByRole('button', { name: 'Resume' }).click();

  await expect(page).toHaveURL(/\/chess\/local\?resume=1$/);
  await expect(page.locator('.square')).toHaveCount(64);
  await expect(page.locator('body')).toContainText('Nf3', { timeout: 15000 });
});

test('discarding a casual game removes it without asking', async ({ page }) => {
  await seed(page, 'gx:inprogress:chess:guest', PASS_AND_PLAY_CHESS);
  await page.goto('/chess/local');

  const card = page.getByRole('region', { name: 'Unfinished game' });
  await card.getByRole('button', { name: 'Discard' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gx:inprogress:chess:guest'))).toBeNull();
});

test('a casual unfinished game does not stand in the way of a new one', async ({ page }) => {
  await seed(page, 'gx:inprogress:chess:guest', PASS_AND_PLAY_CHESS);
  await page.goto('/chess/local');

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.square')).toHaveCount(64);
  // A fresh board: the saved game's moves are not on it.
  await expect(page.locator('body')).not.toContainText('Nf3');
});

test('a finished pass-and-play game leaves nothing to resume', async ({ page }) => {
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.square');
  await expect(squares).toHaveCount(64);
  // The board takes input once the engine worker has sent its first position.
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  const e2 = squares.nth((8 - 2) * 8 + 4);
  const e4 = squares.nth((8 - 4) * 8 + 4);
  await e2.click();
  await expect(e4).toHaveClass(/valid-move/, { timeout: 15000 });
  await e4.click();
  await expect(page.locator('body')).toContainText('e4', { timeout: 15000 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('gx:inprogress:chess:guest')))
    .not.toBeNull();

  const resign = page.getByRole('button', { name: /^Resign\??$/ });
  await resign.click();
  await resign.click();
  await expect(page.getByText(/White wins|Black wins/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pass & Play' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unfinished game' })).toHaveCount(0);
});
