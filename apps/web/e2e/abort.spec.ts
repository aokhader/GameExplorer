import { test, expect, type Page } from '@playwright/test';
import { ABORT_MOVE_LIMIT } from '@gameexplorer/shared';

/**
 * A game's opening moves can be cancelled rather than conceded.
 *
 * Resigning a game you set up wrong two moves ago writes a loss — a rated one,
 * if the switch was on — for a game that never really happened. Multiplayer has
 * always allowed an abort below `ABORT_MOVE_LIMIT` moves; these are the local
 * and bot screens doing the same.
 */

/** Chess squares, white at the bottom: index = (8 - rank) * 8 + file. */
const sq = (page: Page, name: string) =>
  page.locator('.square').nth((8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97));

const SAVE_KEY = 'gx:inprogress:chess:guest';

async function startBotGame(page: Page) {
  await page.goto('/chess/bot');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
}

/** Plies the saved game has recorded. */
const plies = (page: Page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw).actions?.length ?? 0) : 0;
  }, SAVE_KEY);

/**
 * Play one of White's moves and wait until the game has recorded `count` plies
 * — our move and the bot's answer, so the next click lands on our own turn.
 *
 * Not the `last-move` highlight: it marks only the latest move, so the bot's
 * reply takes it back off our square, sometimes before an assertion can see it.
 * Not a relative count either — a click during the bot's turn is queued as a
 * premove, and the bot's own reply would satisfy "one more than before" while
 * ours still sat in the queue. (Same gate as `helpers/abortWindow`.)
 */
async function move(page: Page, from: string, to: string, count: number) {
  await sq(page, from).click();
  await sq(page, to).click();
  await expect.poll(() => plies(page), { timeout: 15000 }).toBeGreaterThanOrEqual(count);
}

test('a game that has barely started offers Abort, not Resign', async ({ page }) => {
  await startBotGame(page);

  await expect(page.getByRole('button', { name: 'Abort' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resign/ })).toHaveCount(0);
});

test('Abort cancels the game and leaves nothing behind', async ({ page }) => {
  await startBotGame(page);
  await move(page, 'e2', 'e4', 2);
  // The move is saved, so the abort has something to clear.
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), SAVE_KEY), { timeout: 15000 })
    .not.toBeNull();

  await page.getByRole('button', { name: 'Abort' }).click();

  // Back at the setup form, with no game to resume and no result recorded.
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), SAVE_KEY), { timeout: 15000 })
    .toBeNull();
  await expect(page.getByText(/Good Game/i)).toHaveCount(0);
});

test('Resign takes over once the game is under way', async ({ page }) => {
  await startBotGame(page);

  // Each of White's moves draws a reply, so this passes the limit in plies.
  await move(page, 'e2', 'e4', 2);
  await move(page, 'd2', 'd4', 4);
  await move(page, 'g1', 'f3', ABORT_MOVE_LIMIT);

  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').actions?.length ?? 0, SAVE_KEY), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(ABORT_MOVE_LIMIT);

  await expect(page.getByRole('button', { name: /^Resign/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abort' })).toHaveCount(0);
});
