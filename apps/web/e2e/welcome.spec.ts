import { test, expect } from '@playwright/test';

// The first-run tour ("play first, sign up later"): four taps drop a guest
// into a bot game at the difficulty they picked. It is optional now — a first
// visit to `/` gets the landing page's one question instead (ux-fix-ideas.md
// §4.4) — so nothing redirects into it.

test('a brand-new visitor gets the landing page, not the tour', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /free, with no sign-up to play/ })).toBeVisible();
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('tour flows into a reversi bot game at the picked difficulty', async ({ page }) => {
  await page.goto('/welcome');

  // Step 1 — welcome
  await page.getByRole('button', { name: /Let’s play/ }).click();

  // Step 2 — pick a game
  await expect(page.getByRole('heading', { name: /What do you feel like playing/ })).toBeVisible();
  await page.getByRole('button', { name: /Reversi/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click();

  // Step 3 — opponent (bot is preselected/recommended)
  await expect(page.getByRole('heading', { name: /first opponent/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue →' }).click();

  // Step 4 — difficulty, then straight into the game
  await expect(page.getByRole('heading', { name: /How tough/ })).toBeVisible();
  await page.getByRole('button', { name: /Relaxed/ }).click();
  await page.getByRole('button', { name: /Start playing/ }).click();

  // Lands mid-game: reversi bot page, setup screen skipped, board live.
  // `casual=1`: the tour calls this practice at a chosen difficulty, and it
  // used to inherit the rated choice remembered from the last game.
  await page.waitForURL('**/reversi/bot?elo=500&start=1&casual=1');
  await expect(page.locator('[data-disc]')).toHaveCount(4);
});

test('skipping the tour goes home', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('link', { name: /Skip the tour/ }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /free, with no sign-up to play/ })).toBeVisible();
});

test('friend/online paths skip difficulty and go to multiplayer', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click(); // chess (default)
  await page.getByRole('button', { name: /Match online/ }).click();
  await page.getByRole('button', { name: /Start playing/ }).click();
  await page.waitForURL('**/chess/play');
});
