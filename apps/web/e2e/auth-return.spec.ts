import { test, expect, type Page } from '@playwright/test';

/**
 * Back on the sign-in and sign-up pages returns to the page you were on.
 *
 * It used to go to `?next=`, and a page that needs an account (training, online
 * play, watching a game) sends a guest to sign-in with `next` set to itself —
 * so Back opened that page, which sent you straight back to sign-in.
 */

const back = (page: Page) => page.getByRole('link', { name: 'Back', exact: true });

/** Long enough for a guard's redirect to have fired if it was going to. */
async function staysOn(page: Page, url: RegExp) {
  await expect(page).toHaveURL(url);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(url);
}

for (const [hub, gated] of [
  ['/chess', '/chess/training'],
  ['/checkers', '/checkers/play'],
] as const) {
  test(`Back from a sign-in that ${gated} asked for returns to ${hub}`, async ({ page }) => {
    await page.goto(hub);
    await page.locator(`a[href="${gated}"]`).first().click();
    await page.waitForURL(/\/auth\/signin\?/);
    expect(new URL(page.url()).searchParams.get('next')).toBe(gated);

    await back(page).click();
    await staysOn(page, new RegExp(`${hub}$`));
  });
}

test('a page that needs an account, opened directly, backs out to the page above it', async ({ page }) => {
  // A fresh tab: there is no earlier page on this site to step back to.
  await page.goto('/reversi/play');
  await page.waitForURL(/\/auth\/signin\?/);
  await expect(back(page)).toHaveAttribute('href', '/reversi');

  await back(page).click();
  await staysOn(page, /\/reversi$/);
});

test('watching a game backs out to the Watch list', async ({ page }) => {
  await page.goto('/spectate/some-game');
  await page.waitForURL(/\/auth\/signin\?/);
  await expect(back(page)).toHaveAttribute('href', '/spectate');
});

test('switching to sign-up keeps the round trip and Back still leaves the auth pages', async ({ page }) => {
  await page.goto('/chess');
  await page.locator('nav').getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL(/\/auth\/signin\?next=%2Fchess$/);

  await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await page.waitForURL(/\/auth\/signup\?next=%2Fchess$/);

  await back(page).click();
  await staysOn(page, /\/chess$/);
});

test("the browser's own Back skips the switch between sign-in and sign-up", async ({ page }) => {
  await page.goto('/chess');
  await page.locator('nav').getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL(/\/auth\/signin\?/);
  await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await page.waitForURL(/\/auth\/signup\?/);

  await page.goBack();
  await expect(page).toHaveURL(/\/chess$/);
});

test("the navbar's Sign in on the sign-up page keeps the round trip, not the sign-up page", async ({ page }) => {
  await page.goto('/auth/signup?next=%2Fchess%2Fplay&back=%2Fchess');
  await expect(page.locator('nav').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/auth/signin?next=%2Fchess%2Fplay&back=%2Fchess',
  );
});

test('a crafted return address can neither leave the site nor loop into the auth pages', async ({ page }) => {
  // The URL parser reads the first two as `//evil.example`, a link off the site.
  for (const next of ['/\\evil.example', '/\t/evil.example', 'https://evil.example', '/auth/signup']) {
    await page.goto(`/auth/signin?next=${encodeURIComponent(next)}&back=${encodeURIComponent(next)}`);
    await expect(back(page)).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/auth/signup');
  }
});
