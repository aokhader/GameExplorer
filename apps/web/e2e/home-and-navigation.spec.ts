import { test, expect, type Page } from '@playwright/test';
import { CHESS_PUZZLES } from '@gameexplorer/shared';
import { fixBoardOrientation } from './helpers/abortWindow';

/**
 * Wave 4 of the UX fix ideas (`project-docs/ux-fix-ideas.md` §3–§4, §8.2):
 * one address with two Homes, the one-question first run, Home · Play · You,
 * the ranked game page, and a phone layout that keeps Resign on screen.
 *
 * Every test runs in a fresh browser context — no cookie, no storage — which is
 * exactly a stranger.
 */

/** Chess squares, white at the bottom: index = (8 - rank) * 8 + file. */
const sq = (page: Page, name: string) =>
  page.locator('.square').nth((8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97));

const LANDING_H1 = /free, with no sign-up to play/;

/**
 * The board draws a move before the engine has confirmed it, and the game is
 * saved on confirmation — so wait for the save before leaving the page.
 */
async function waitForSave(page: Page, key = 'gx:inprogress:chess:guest') {
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key), { timeout: 15000 }).not.toBeNull();
}

/** The landing page is static; its picker answers once it has hydrated. */
async function pick(page: Page, name: string) {
  const tile = page.getByRole('button', { name, exact: true });
  await expect(async () => {
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  }).toPass({ timeout: 15000 });
}

test('a stranger’s Play is one click to a live board at Club strength', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play Chess' }).click();
  await page.waitForURL('**/chess/bot?elo=1200&start=1&casual=1');
  // Straight onto the board — no setup form on the way.
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCount(0);
});

test('the first-run picker offers every game, and a first lesson for a newcomer', async ({ page }) => {
  await page.goto('/');
  await pick(page, 'Go');
  await expect(page.getByRole('link', { name: 'Play Go' })).toHaveAttribute('href', '/go/bot?elo=1100&start=1&casual=1');
  await expect(page.getByRole('link', { name: 'I’m new to Go' })).toHaveAttribute('href', /^\/go\/learn\/.+/);

  await pick(page, 'Liquidate');
  await expect(page.getByRole('link', { name: 'Play Liquidate' })).toHaveAttribute('href', '/liquidate/bot?start=1');
  // Liquidate has no lessons; its rules page stands in.
  await expect(page.getByRole('link', { name: 'I’m new to Liquidate' })).toHaveAttribute('href', '/liquidate/learn');
});

test('today’s puzzle is a real board, drawn by the server, that takes the answer', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-puzzle-id]');
  await expect(card.locator('.square')).toHaveCount(64);
  // Opening the landing page is not playing here: it must stay the landing page.
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === 'gx_returning')).toBe(false);

  const id = await card.getAttribute('data-puzzle-id');
  const puzzle = CHESS_PUZZLES.find((p) => p.id === id);
  expect(puzzle, `puzzle ${id} is one of the hand-written set`).toBeTruthy();
  // Board orientation follows the side to move.
  const square = (name: string) =>
    puzzle!.playerColor === 'white'
      ? sq(page, name)
      : page.locator('.square').nth((Number(name[1]) - 1) * 8 + (7 - (name.charCodeAt(0) - 97)));
  const status = page.getByTestId('daily-puzzle-status');

  // Play the whole line. The board is server-rendered and takes moves once it
  // has hydrated, so the first move is retried until it lands.
  const steps = puzzle!.steps;
  for (const [i, step] of steps.entries()) {
    const last = i === steps.length - 1;
    await expect(async () => {
      await square(step.move.slice(0, 2)).click();
      await square(step.move.slice(2, 4)).click();
      if (step.move.length > 4) await page.getByRole('button', { name: /queen/i }).first().click();
      await expect(status).toHaveText(last ? /Solved/ : /Right/, { timeout: 1500 });
    }).toPass({ timeout: 20000 });
    // The scripted reply, then the prompt again.
    if (!last) await expect(status).toHaveText(puzzle!.prompt, { timeout: 10000 });
  }

  // Seeing the puzzle made nobody a returning player; solving it did.
  await expect
    .poll(async () => (await page.context().cookies()).some((c) => c.name === 'gx_returning'))
    .toBe(true);
});

test('anyone who has played gets the launcher at the same address', async ({ page }) => {
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });

  // The game left the cookie behind; `/` is now the launcher, without a redirect.
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'gx_returning')).toBe(true);
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toHaveCount(0);
  await expect(page.getByTestId('launcher-top')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible();
});

test('a player whose history predates the cookie is sent on to the launcher', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gx:setup:chess:bot', JSON.stringify({ elo: 1500, color: 'black', rated: false }));
    localStorage.setItem('gx:setup:chess:mode', 'bot');
    localStorage.setItem('gx:playedAt', JSON.stringify({ chess: Date.now() }));
  });
  await page.goto('/');
  await expect(page.getByTestId('launcher-top')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Play Chess again' })).toBeVisible();
  await expect(page.getByText('vs Bot 1500 · Black')).toBeVisible();
  await expect(page.getByTestId('launcher-top').getByRole('link', { name: 'Play', exact: true })).toHaveAttribute(
    'href',
    '/chess/bot?start=1',
  );
});

test('the navigation is Home · Play · You, with Learn and Watch beside it', async ({ page }) => {
  await page.goto('/learn');
  const main = page.getByRole('navigation', { name: 'Main', exact: true });
  for (const name of ['Home', 'Play', 'You', 'Learn', 'Watch']) {
    await expect(main.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(main.getByRole('link', { name: 'Learn', exact: true })).toHaveAttribute('aria-current', 'page');
  // Five rows, one per game, each to its rules.
  await expect(page.getByRole('link', { name: /The rules/ })).toHaveCount(5);
});

test('on a phone the three places are a bar at the bottom of the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/learn');
  const bar = page.getByRole('navigation', { name: 'Main (bottom)' });
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(844, 0);
  for (const name of ['Home', 'Play', 'You']) {
    const link = bar.getByRole('link', { name, exact: true });
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('Play goes to the picker, which carries the unfinished game', async ({ page }) => {
  // Pass-and-play turns the board between turns, so the moment e4 is played the
  // square this test calls "e4" is d5 — empty, and the reason the assertion
  // below used to fail. Every other spec naming squares on this board pins the
  // orientation first; this one has to as well.
  await fixBoardOrientation(page);
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await expect(sq(page, 'e4')).toHaveClass(/last-move/, { timeout: 15000 });
  await waitForSave(page);

  // Play is one address now, not a destination that changes under the visitor.
  await page.goto('/learn');
  const play = page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Play', exact: true });
  await expect(play).toHaveAttribute('href', '/play');
  await play.click();

  // …and the unfinished game is the first thing on it.
  const carryOn = page.getByRole('region', { name: 'Carry on' });
  await expect(carryOn).toBeVisible();
  await expect(carryOn.getByRole('link', { name: /Chess/ })).toHaveAttribute('href', '/chess/local?resume=1');
});

test('the Play page shows the setup as chips you can change', async ({ page }) => {
  await page.goto('/play?game=go');

  // The board size is the choice that defines a game of Go, and the old
  // summary printed it only when it was *not* the default.
  const setup = page.getByRole('list', { name: 'Game setup' });
  const board = setup.getByRole('button', { name: /Board/ });
  await expect(board).toContainText('9×9');

  await expect(async () => {
    await board.click();
    await expect(page.getByRole('radio', { name: /13×13/ })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });

  await page.getByRole('radio', { name: /13×13/ }).click();
  await expect(board).toContainText('13×13');

  // A locked choice says why. For a guest that is the account, which comes
  // first; Go's own rule (only 9×9 at 7.5 komi is rated) is unit-tested,
  // because reaching it here would need a signed-in session.
  await page.getByRole('button', { name: /Rating/ }).click();
  await expect(page.getByText('Sign in to play rated games')).toBeVisible();
});

test('a first game is never rated, whatever was played last', async ({ page }) => {
  // The tour and the first-run picker both promise practice; they used to
  // inherit the rated choice remembered from the player's last game.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Play Chess' })).toHaveAttribute(
    'href',
    '/chess/bot?elo=1200&start=1&casual=1',
  );
});

test('a start link never starts over an unfinished game', async ({ page }) => {
  await page.goto('/chess/bot');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  // The save is the gate, not the `last-move` highlight — against a bot that
  // highlight is gone again the moment the reply lands, and waiting on it here
  // was a race this test lost under load.
  await waitForSave(page);

  await page.goto('/chess/bot?start=1');
  // The form, with the waiting game offered — not a new game over it.
  await expect(page.getByRole('region', { name: 'Unfinished game' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.chess-board')).toHaveCount(0);
});

test('the game page ranks its ways to play and marks the last one played', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gx:setup:checkers:mode', 'pass-and-play'));
  await page.goto('/checkers');
  await expect(page.getByTestId('play-panel')).toBeVisible();
  const secondary = page.getByRole('list', { name: 'More ways to play Checkers' });
  await expect(secondary.getByRole('link')).toHaveCount(3);
  await expect(secondary.getByRole('link', { name: /Pass & Play/ })).toContainText('Last played');
  // Go has no online mode, and the page does not pretend otherwise.
  await page.goto('/go');
  await expect(page.getByRole('list', { name: 'More ways to play Go' }).getByRole('link')).toHaveCount(2);
});

test('a first refused move says why, once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gx:settings', JSON.stringify({ flipBoardPassAndPlay: false })));
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });

  // 1. e4 e5 2. Qh5 Nc6 3. Qxf7+ — Black is in check, and the king can take.
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['h5', 'f7']]) {
    await sq(page, from).click();
    await sq(page, to).click();
    await expect(sq(page, to)).toHaveClass(/last-move/, { timeout: 15000 });
  }
  await expect(page.getByTestId('board-tip')).toContainText('Your king is in check');

  // A pawn move that ignores the check.
  await sq(page, 'a7').click();
  await sq(page, 'a6').click();
  await expect(page.getByTestId('board-tip')).toContainText('You’re in check, so your move has to end it.');
});

test('on a phone, the end-game control and the whole board are on screen together', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });

  const board = await page.locator('.chess-board').boundingBox();
  // Abort holds this slot for the opening moves; the geometry is the point.
  const resign = await page.getByRole('button', { name: /^(Resign??|Abort)$/ }).boundingBox();
  const strip = await page.getByTestId('move-strip').boundingBox();
  expect(board && resign && strip).toBeTruthy();
  expect(board!.y).toBeGreaterThanOrEqual(0);
  expect(board!.y + board!.height).toBeLessThanOrEqual(resign!.y);
  expect(resign!.y + resign!.height).toBeLessThanOrEqual(740);
  // The move strip sits under the actions, still on screen.
  expect(strip!.y + strip!.height).toBeLessThanOrEqual(740);
});
