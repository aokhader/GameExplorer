import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The site-wide config is where three of the audit's web findings lived: a
 * proxy to the whole API (GX-10), no security headers (GX-15) and an image
 * optimizer open to a stranger's domain (GX-20). Each test here fails if one
 * comes back.
 */

const SUPABASE = 'https://abcdefghijklmnop.supabase.co';
const API = 'https://gameexplorer-api.onrender.com';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function rewriteRules() {
  const result = await nextConfig.rewrites!();
  return Array.isArray(result)
    ? result
    : [...(result.beforeFiles ?? []), ...(result.afterFiles ?? []), ...(result.fallback ?? [])];
}

/** Every header a page on the site is served with, as Next would merge them. */
async function pageHeaders(): Promise<Record<string, string>> {
  const entries = await nextConfig.headers!();
  const out: Record<string, string> = {};
  for (const entry of entries.filter((e) => e.source === '/:path*')) {
    for (const { key, value } of entry.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

/** The full policy, whichever header carries it. */
function fullPolicy(headers: Record<string, string>): string {
  const policy = headers['content-security-policy-report-only'] ?? headers['content-security-policy'];
  expect(policy).toContain('connect-src');
  return policy;
}

function directive(policy: string, name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  expect(found, `${name} is missing`).toBeDefined();
  return found!.slice(1);
}

describe('rewrites', () => {
  it.each(['production', 'development'])('never send a request to another host (%s)', async (env) => {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    for (const rule of await rewriteRules()) {
      expect(rule.destination.startsWith('/'), rule.destination).toBe(true);
      expect(rule.source.startsWith('/api'), rule.source).toBe(false);
    }
  });

  it('keep the returning-visitor rewrite', async () => {
    const rules = await rewriteRules();
    expect(rules).toContainEqual(expect.objectContaining({ source: '/', destination: '/home' }));
  });
});

describe('images', () => {
  it('lets the optimizer fetch from no remote host', () => {
    expect(nextConfig.images?.remotePatterns ?? []).toEqual([]);
    expect(nextConfig.images?.domains ?? []).toEqual([]);
  });
});

describe('security headers', () => {
  it('refuse framing, sniffing and unused browser features on every page', async () => {
    const headers = await pageHeaders();
    const enforced = headers['content-security-policy'];
    for (const rule of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) {
      expect(enforced).toContain(rule);
    }
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(headers['permissions-policy']).toContain(`${feature}=()`);
    }
    // Sound effects can start after the bot's move, not only on a tap.
    expect(headers['permissions-policy']).not.toContain('autoplay');
  });

  it('keep cross-origin isolation, which the multi-threaded engine needs', async () => {
    const headers = await pageHeaders();
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  });

  it('let the page reach this site, Supabase and the game API, and nowhere else', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE);
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    const connect = directive(fullPolicy(await pageHeaders()), 'connect-src');
    expect(connect.sort()).toEqual(
      ["'self'", SUPABASE, API, 'wss://gameexplorer-api.onrender.com'].sort(),
    );
  });

  it("follow ClientConfig's fallback when no API address is set", async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    const connect = directive(fullPolicy(await pageHeaders()), 'connect-src');
    expect(connect).toContain('http://localhost:4000');
    expect(connect).toContain('ws://localhost:4000');
  });

  it('let Stockfish compile its WebAssembly and start its workers', async () => {
    const policy = fullPolicy(await pageHeaders());
    expect(directive(policy, 'script-src')).toContain("'wasm-unsafe-eval'");
    expect(directive(policy, 'worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allow eval only on the dev server', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(directive(fullPolicy(await pageHeaders()), 'script-src')).not.toContain("'unsafe-eval'");
    vi.stubEnv('NODE_ENV', 'development');
    expect(directive(fullPolicy(await pageHeaders()), 'script-src')).toContain("'unsafe-eval'");
  });

  it('allow no wildcard or bare-scheme source', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE);
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    const policy = fullPolicy(await pageHeaders());
    for (const source of policy.split(/[;\s]+/)) {
      expect(source, policy).not.toMatch(/\*/);
      expect(source, policy).not.toMatch(/^(https?|wss?):$/);
    }
  });

  it('keep the engine files cacheable forever', async () => {
    const entries = await nextConfig.headers!();
    const stockfish = entries.find((e) => e.source === '/stockfish/:path*');
    expect(stockfish?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
  });
});
