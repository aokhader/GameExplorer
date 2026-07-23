// Shared CORS origin policy for both the REST app (app.ts) and the Socket.io
// server (websocket/index.ts) — they MUST agree, or a browser that can reach
// one can't reach the other.
//
// The problem this solves: CORS_ORIGIN is a single production alias
// (https://game-explorer-site.vercel.app), but every Vercel *preview*
// deployment gets its own hostname
// (https://game-explorer-site-<hash>-<team>.vercel.app). A single exact origin
// therefore rejects every preview — which is where App Store review testing and
// pre-release checks happen. So we allow exact matches from CORS_ORIGIN AND, for
// any *.vercel.app origin named there, that project's preview deployments.
//
// Why this is safe: API auth is a Bearer token carried in the Authorization
// header (and returned in the login response body), never a cookie. CORS does
// not gate token theft here — a hostile page can't read another origin's
// localStorage regardless. Restricting to *this project's* preview subdomains
// (not all of vercel.app) keeps the surface tight without blocking previews.
import { logger } from '../utils/logger';

type OriginCallback = (err: Error | null, allow?: boolean) => void;

/** Split "a, b ,c" → ["a","b","c"], dropping blanks. */
function parseList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Escape a string for safe interpolation into a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the set of exact origins and the preview-deployment patterns derived
 * from any Vercel production alias in that set. Computed once at startup.
 */
function buildPolicy() {
  const exact = new Set(parseList(process.env.CORS_ORIGIN, 'http://localhost:3000'));
  const patterns: RegExp[] = [];

  for (const origin of exact) {
    // Production alias like https://game-explorer-site.vercel.app → allow
    // https://game-explorer-site-<anything>.vercel.app (preview builds).
    const match = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/i.exec(origin);
    if (match) {
      patterns.push(new RegExp(`^https://${escapeRegExp(match[1])}-[a-z0-9-]+\\.vercel\\.app$`, 'i'));
    }
  }

  // Optional explicit escape hatch for anything the derivation above misses
  // (custom domains, a staging host, etc.).
  const extra = process.env.CORS_ORIGIN_REGEX;
  if (extra) {
    try {
      patterns.push(new RegExp(extra, 'i'));
    } catch {
      logger.error(`Ignoring invalid CORS_ORIGIN_REGEX: ${extra}`);
    }
  }

  return { exact, patterns };
}

const policy = buildPolicy();

/** True for an origin we serve cross-origin. */
export function isAllowedOrigin(origin: string): boolean {
  return policy.exact.has(origin) || policy.patterns.some((re) => re.test(origin));
}

/**
 * The `origin` option for both `cors()` and Socket.io. Requests with no Origin
 * header (curl, native apps, same-origin/server-to-server) are allowed — CORS
 * only governs browsers, which always send one.
 */
export function corsOrigin(origin: string | undefined, callback: OriginCallback): void {
  if (!origin || isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  logger.warn(`CORS: blocked origin ${origin}`);
  callback(null, false);
}
