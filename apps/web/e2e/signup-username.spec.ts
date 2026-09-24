import { test, expect, type Page } from '@playwright/test';

/**
 * The sign-up form's live username check.
 *
 * The check is ADVISORY — the database decides — so the assertion that matters
 * most here is that an API which cannot answer (down, cold, or just slow) never
 * disables the button. The API and the web app deploy separately; a check that
 * blocked on failure would turn any API outage into a total sign-up outage.
 *
 * Every API answer is stubbed with page.route, so these tests do not depend on
 * whether an API happens to be running. And none of them ever presses
 * "Create account": the e2e server talks to the real Supabase project.
 */

const CHECK = '**/api/auth/username-available**';

async function fillValidRest(page: Page) {
  await page.getByLabel('Email').fill('e2e@example.invalid');
  await page.getByLabel('Password').fill('correct horse battery staple');
}

const submit = (page: Page) => page.getByRole('button', { name: 'Create account' });
const usernameField = (page: Page) => page.getByLabel('Username', { exact: true });

test('an API that cannot answer never blocks sign-up', async ({ page }) => {
  await page.route(CHECK, (route) => route.abort('connectionrefused'));
  await page.goto('/auth/signup');

  await usernameField(page).fill('fresh_name_e2e');
  await fillValidRest(page);

  await expect(submit(page)).toBeEnabled();
  // …and says nothing alarming about it.
  await expect(usernameField(page)).not.toHaveAttribute('aria-invalid', 'true');
});

test('a hung check gives up and enables the button', async ({ page }) => {
  // Never answered: the hook's own timeout (5s) is what has to rescue this.
  await page.route(CHECK, () => {});
  await page.goto('/auth/signup');

  await usernameField(page).fill('fresh_name_e2e');
  await fillValidRest(page);

  await expect(submit(page)).toBeEnabled({ timeout: 10_000 });
});

test('a taken name is flagged on the field and blocks submit', async ({ page }) => {
  await page.route(CHECK, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false, reason: 'taken' }) }),
  );
  await page.goto('/auth/signup');

  await usernameField(page).fill('Bob');
  await fillValidRest(page);

  await expect(page.getByText('That username is taken. Try another.')).toBeVisible();
  await expect(usernameField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(submit(page)).toBeDisabled();
});

test('an available name says so and allows submit', async ({ page }) => {
  await page.route(CHECK, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, reason: 'ok' }) }),
  );
  await page.goto('/auth/signup');

  await usernameField(page).fill('fresh_name_e2e');
  await fillValidRest(page);

  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await expect(submit(page)).toBeEnabled();
});

test('format and reserved names are refused locally, without asking the API', async ({ page }) => {
  let checks = 0;
  await page.route(CHECK, (route) => {
    checks += 1;
    return route.abort();
  });
  await page.goto('/auth/signup');
  await fillValidRest(page);

  await usernameField(page).fill('bob smith');
  await expect(page.getByText('Use only letters, numbers and _.')).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  await usernameField(page).fill('Admin');
  await expect(page.getByText('That username is reserved. Try another.')).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  // Past the 300ms debounce, and still nothing was sent.
  await page.waitForTimeout(600);
  expect(checks).toBe(0);
});

test('the field stops at 20 characters', async ({ page }) => {
  await page.goto('/auth/signup');
  await usernameField(page).fill('a'.repeat(25));
  await expect(usernameField(page)).toHaveValue('a'.repeat(20));
});

test('both auth pages label their fields', async ({ page }) => {
  await page.goto('/auth/signup');
  for (const label of ['Username', 'Email', 'Password']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }

  await page.goto('/auth/signin');
  await expect(page.getByLabel('Username or email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});
