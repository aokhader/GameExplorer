import { test, expect } from '@playwright/test';

/**
 * What the running server actually sends (security audit v2, Wave 5). The unit
 * tests read next.config.ts; these prove Next applies it, on a static page and
 * on a page behind the sign-in guard.
 */

for (const path of ['/', '/chess/play']) {
  test(`${path} refuses framing and sniffing, and carries the content policy`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    const headers = res.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    const policy = headers['content-security-policy-report-only'] ?? headers['content-security-policy'];
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  });
}

test('the site no longer relays requests to the game API', async ({ request }) => {
  // With the relay (GX-10) this reached the API's health check and answered 200.
  const res = await request.get('/api/health');
  expect(res.status()).toBe(404);
});
