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

// CORS_ORIGIN doubles as the source of the public web origin the server puts in
// invite links. Once it became a list, reading it raw produced
// "https://a,https://b/chess/play?invite=…" — so the first entry wins.
describe('publicWebUrl', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns the only origin when one is configured', async () => {
    const { publicWebUrl } = await loadWith({ CORS_ORIGIN: PROD });
    expect(publicWebUrl()).toBe(PROD);
  });

  it('returns the FIRST origin of a comma-separated list, never the joined string', async () => {
    const { publicWebUrl } = await loadWith({ CORS_ORIGIN: `${PROD}, http://localhost:3000` });
    expect(publicWebUrl()).toBe(PROD);
    expect(publicWebUrl()).not.toContain(',');
  });

  it('tolerates surrounding whitespace and a trailing slash', async () => {
    const { publicWebUrl } = await loadWith({ CORS_ORIGIN: `  ${PROD}/  , http://localhost:3000` });
    expect(publicWebUrl()).toBe(PROD);
  });

  it('falls back to localhost when CORS_ORIGIN is unset or blank', async () => {
    const unset = await loadWith({ CORS_ORIGIN: undefined });
    expect(unset.publicWebUrl()).toBe('http://localhost:3000');
    const blank = await loadWith({ CORS_ORIGIN: ' , ' });
    expect(blank.publicWebUrl()).toBe('http://localhost:3000');
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
