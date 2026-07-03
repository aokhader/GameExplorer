import { test, expect } from '@playwright/test';

// First-time onboarding tour (Arcade Glow "play first, sign up later"):
// brand-new guests land on /welcome from the home page, and four taps drop
// them straight into a bot game at the difficulty they picked.

test('brand-new visitor is redirected from home to the tour', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/welcome');
  await expect(page.getByRole('heading', { name: /Welcome to GameExplorer/ })).toBeVisible();
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
  await page.waitForURL('**/reversi/bot?elo=500&start=1');
  await expect(page.locator('[data-disc]')).toHaveCount(4);
});

test('skipping the tour goes home and does not redirect again', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('link', { name: /Skip the tour/ }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'GameExplorer' })).toBeVisible();

  // Reload — the onboarded flag now suppresses the first-visit redirect.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GameExplorer' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('friend/online paths skip difficulty and go to multiplayer', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: 'Continue →' }).click(); // chess (default)
  await page.getByRole('button', { name: /Match online/ }).click();
  await page.getByRole('button', { name: /Start playing/ }).click();
  await page.waitForURL('**/chess/play');
});
