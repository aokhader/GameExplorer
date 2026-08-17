import { test, expect } from '@playwright/test';

/**
 * The store-facing compliance surfaces.
 *
 * These exist because both app stores require them and because a build already
 * went to Play testers without any terms at all. They have no in-app traffic
 * driving them, so nothing else would notice if a link rotted or a page stopped
 * building — which is exactly the failure mode worth a test.
 */

test('terms and privacy are reachable from the landing footer', async ({ page }) => {
  // A brand-new guest is redirected to the /welcome tour — mark this browser as
  // already onboarded so we land on the home page itself.
  await page.addInitScript(() => localStorage.setItem('ge:onboarded', '1'));
  await page.goto('/');

  const footer = page.locator('footer');
  for (const href of ['/terms', '/privacy', '/delete-account', '/licenses']) {
    await expect(footer.locator(`a[href="${href}"]`)).toBeVisible();
  }
});

test('the terms page states the rules the app actually enforces', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Terms of Service');

  // The sections a store reviewer looks for, and the ones the moderation
  // controls in the app depend on being written down.
  for (const heading of ['Fair play', 'Community rules', 'Your account']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
});

test('the privacy policy covers chat, which mobile shipped in August 2026', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy Policy');

  // Chat is the item the stores' data-safety declarations were filed without.
  // If this wording disappears, the policy and those declarations have drifted.
  await expect(page.getByText(/Online chat and emotes/i)).toBeVisible();
  await expect(page.getByText(/never written to our database/i)).toBeVisible();

  // Retention had never been stated at all before this pass.
  await expect(page.getByRole('heading', { name: /How long/i })).toBeVisible();
});

test('signup states assent to the terms, and links to both documents', async ({ page }) => {
  await page.goto('/auth/signup');

  const notice = page.getByText(/By creating an account you agree/i);
  await expect(notice).toBeVisible();
  // Assent is meaningless if the documents are not reachable from the notice.
  await expect(page.locator('a[href="/terms"]')).toBeVisible();
  await expect(page.locator('a[href="/privacy"]')).toBeVisible();
});

test('the browser icon is first-party, not the create-next-app default', async ({ page }) => {
  await page.goto('/');

  // The scaffold shipped Vercel's logo at /favicon.ico and it stayed the site's
  // only icon for five months. Both halves matter: the new icon is served, and
  // the old path no longer is.
  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveAttribute('href', /icon\.svg/);

  const stale = await page.request.get('/favicon.ico');
  expect(stale.status()).toBe(404);
});
