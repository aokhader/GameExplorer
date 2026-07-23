// CORS origin policy. The behaviour that matters: exact production origins pass,
// this project's Vercel preview deployments pass, unrelated origins (including
// other vercel.app sites) do not, and no-Origin requests are allowed.
//
// The policy is built from env at module load, so each scenario sets env and
// imports a fresh copy via vi.resetModules() + dynamic import.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../cors');
}

const PROD = 'https://game-explorer-site.vercel.app';
const PREVIEW = 'https://game-explorer-site-muvj7gaed-abdulazizs-projects-5d72a3ac.vercel.app';

describe('isAllowedOrigin', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGIN_REGEX;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('allows an exact production origin from CORS_ORIGIN', async () => {
    const { isAllowedOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    expect(isAllowedOrigin(PROD)).toBe(true);
  });

  it('allows a Vercel preview deployment of the same project', async () => {
    const { isAllowedOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    expect(isAllowedOrigin(PREVIEW)).toBe(true);
  });

  it('rejects a different project on vercel.app', async () => {
    const { isAllowedOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    expect(isAllowedOrigin('https://someone-elses-app.vercel.app')).toBe(false);
    // Even one that merely starts differently before the dash.
    expect(isAllowedOrigin('https://game-explorer-evil.vercel.app')).toBe(false);
  });

  it('rejects an unrelated origin', async () => {
    const { isAllowedOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('supports a comma-separated list', async () => {
    const { isAllowedOrigin } = await loadWith({
      CORS_ORIGIN: `http://localhost:3000, ${PROD}`,
    });
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin(PROD)).toBe(true);
    expect(isAllowedOrigin(PREVIEW)).toBe(true);
  });

  it('honours an explicit CORS_ORIGIN_REGEX escape hatch', async () => {
    const { isAllowedOrigin } = await loadWith({
      CORS_ORIGIN: 'http://localhost:3000',
      CORS_ORIGIN_REGEX: '^https://staging\\.example\\.com$',
    });
    expect(isAllowedOrigin('https://staging.example.com')).toBe(true);
    expect(isAllowedOrigin('https://prod.example.com')).toBe(false);
  });
});

describe('corsOrigin callback', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('allows requests with no Origin (curl, native apps)', async () => {
    const { corsOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    const cb = vi.fn();
    corsOrigin(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('does not throw for a blocked origin — it just denies', async () => {
    const { corsOrigin } = await loadWith({ CORS_ORIGIN: PROD });
    const cb = vi.fn();
    corsOrigin('https://evil.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });
});
