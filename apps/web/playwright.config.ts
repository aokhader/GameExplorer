import { defineConfig, devices } from '@playwright/test';

// Frontend E2E tests. The dev server needs apps/web/.env.local (Supabase
// public env) to boot; the API server is NOT required — these tests cover
// unauthenticated flows (navigation, bot play, auth guards) only.
// Run with: pnpm --filter @finesse/web test:e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Dev server locally (fast iteration, reuses one you already have running);
    // production build in CI (deterministic, no on-demand compilation).
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
