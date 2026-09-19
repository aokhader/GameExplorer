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

// You is a place for guests too (ux-fix-ideas.md §3.1): it used to bounce them
// to sign-in, which left a guest's Settings behind an account they did not have.
test('profile shows a guest what an account adds, and their settings', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Playing as a guest' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Playing as a guest' }).getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
    'href',
    /\/auth\/signin\?next=%2Fprofile/,
  );
  await expect(page.getByRole('link', { name: /^Settings/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/profile');
});

test('bot play does NOT require sign-in', async ({ page }) => {
  await page.goto('/reversi/bot');
  // Setup screen renders instead of a redirect.
  await expect(page.getByRole('heading', { name: 'Play the bot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  expect(page.url()).toContain('/reversi/bot');
});
