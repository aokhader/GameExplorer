import { test, expect } from '@playwright/test';

// Pages that require a signed-in user must bounce anonymous visitors to the
// sign-in page (these run with no Supabase session in the browser).

test('multiplayer play page redirects anonymous users to sign-in', async ({ page }) => {
  await page.goto('/chess/play');
  await page.waitForURL(/\/auth\/signin/);
  expect(page.url()).toContain('next=');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('training page redirects anonymous users to sign-in', async ({ page }) => {
  await page.goto('/reversi/training');
  await page.waitForURL(/\/auth\/signin/);
  expect(page.url()).toContain('next=');
});

test('profile page redirects anonymous users to sign-in', async ({ page }) => {
  await page.goto('/profile');
  await page.waitForURL(/\/auth\/signin/);
});

test('bot play does NOT require sign-in', async ({ page }) => {
  await page.goto('/reversi/bot');
  // Setup screen renders instead of a redirect.
  await expect(page.getByRole('heading', { name: 'Play vs Bot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  expect(page.url()).toContain('/reversi/bot');
});
