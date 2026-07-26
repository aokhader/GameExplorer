import { test, expect, type Page } from '@playwright/test';

// A signed-out guest must never attempt to persist a bot game. The `games`
// insert policy only accepts rows where auth.uid() = user_id, so an anonymous
// insert is rejected with 42501 — and the row would be invisible to every
// client anyway (see `isSignedIn` in packages/db/src/games.ts). The writers bail
// out before the request; these tests assert that from the browser, where the
// whole page → lib/db → supabase-js path actually runs.
//
// Requests to the games table are aborted as well as recorded, so a regression
// can never write to the real Supabase project from a test run.

async function watchGameWrites(page: Page) {
  const writes: string[] = [];
  await page.route('**/rest/v1/games**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
    await route.abort();
  });
  return writes;
}

const BOT_PAGES = [
  { game: 'chess', path: '/chess/bot' },
  { game: 'checkers', path: '/checkers/bot' },
  { game: 'reversi', path: '/reversi/bot' },
] as const;

for (const { game, path } of BOT_PAGES) {
  test(`resigning a ${game} bot game as a guest writes nothing`, async ({ page }) => {
    const writes = await watchGameWrites(page);

    await page.goto(path);
    await page.getByRole('button', { name: /Beginner/ }).click();
    await page.getByRole('button', { name: 'Start Game' }).click();

    // Resign asks for a second click within 3s (the GameActions confirm step).
    const resign = page.getByRole('button', { name: /^Resign\??$/ });
    await resign.click();
    await resign.click();

    // The result screen proves the end-of-game save path actually ran — without
    // it the assertion below would also pass on a game that never finished.
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();

    expect(writes).toEqual([]);
  });
}
