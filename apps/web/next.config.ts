import type { NextConfig } from 'next';

// ── Security headers (security audit v2, GX-15) ─────────────────────────────
//
// Set here rather than in a middleware: a per-request nonce would make every
// page dynamic, and `/` and `/home` are kept static on purpose (see the rewrite
// below). The price is that Next's own inline scripts can be neither nonced nor
// hashed, so `script-src` has to allow inline script. That does not stop an
// injected script. What the policy does stop is loading script from another
// site and, through `connect-src`, sending anything to a host that is not
// ours; the session lives in cookies scripts can read, so that is the step
// that matters.

/**
 * Enforced from the first deploy: nothing in the app is framed, uses <base> or
 * <object>, or submits a form to an address (every submit is a click handler).
 */
const BASELINE_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";

/**
 * The full policy is enforced, and replaces BASELINE_CSP, which it contains. It
 * went out report-only first: guest pages were checked with it enforced, and
 * the signed-in ones (profile, online play, settings) showed no "[Report Only]"
 * console line in production. Set this to false to go back to report-only, where
 * browsers log what the policy would block and block nothing.
 */
const ENFORCE_FULL_CSP = true;

/** An absolute URL's origin, or null for a missing or malformed value. */
function parseOrigin(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Where the page may connect: this site (analytics beacons, puzzle chunks, the
 * engine's .wasm), Supabase for auth and the database, and the game API over
 * https and, for the socket, wss. Read from the variables the client builds its
 * own URLs from, with ClientConfig's fallback for the API. Supabase needs no
 * wss: nothing uses its realtime channels.
 */
function connectSources(): string[] {
  const sources = new Set(["'self'"]);
  const supabase = parseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (supabase) sources.add(supabase.origin);
  const api = parseOrigin(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');
  if (api) {
    sources.add(api.origin);
    sources.add(`${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`);
  }
  return [...sources];
}

function fullCsp(): string {
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'blob:'];
  // The dev server's bundles and React's dev tooling use eval; a production
  // build does not.
  if (process.env.NODE_ENV === 'development') scripts.push("'unsafe-eval'");
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    // 'wasm-unsafe-eval': without it Chrome refuses to compile Stockfish's
    // WebAssembly, which takes the chess bots from 1400 up, analysis and hints
    // with it. blob: is the multi-threaded build starting its thread workers
    // and loading its script into them.
    'script-src': scripts,
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
    // next/font writes its @font-face rules in an inline <style>, and React
    // renders style={{…}} as a style attribute.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    // Sound is synthesised with the Web Audio API; no media file is loaded.
    'media-src': ["'none'"],
    'manifest-src': ["'self'"],
    'connect-src': connectSources(),
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Browser features the app never uses, refused for this page and anything it
 * might ever frame. `autoplay` is left alone: sound effects play from an
 * AudioContext, sometimes after the bot's move rather than the player's tap.
 */
const PERMISSIONS_POLICY = [
  'accelerometer',
  'camera',
  'display-capture',
  'encrypted-media',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ');

function securityHeaders(): { key: string; value: string }[] {
  const csp = fullCsp();
  return [
    ...(ENFORCE_FULL_CSP
      ? [{ key: 'Content-Security-Policy', value: csp }]
      : [
          { key: 'Content-Security-Policy', value: BASELINE_CSP },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ]),
    // The older spelling of frame-ancestors, for browsers that predate it.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Already most browsers' default. Stated because paths here carry game,
    // review and invite ids, and an invite id is enough to join the game.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  ];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // For monorepo setup - transpile shared packages
  transpilePackages: ['@gameexplorer/client', '@gameexplorer/shared', '@gameexplorer/ui'],

  experimental: {
    // framer-motion has a large barrel export; pull in only the pieces the
    // lazy GameResultScreen / EmoteBar actually use rather than the whole tree.
    optimizePackageImports: ['framer-motion'],
  },

  async headers() {
    return [
      {
        // Cross-origin isolation unlocks SharedArrayBuffer, which the
        // multi-threaded Stockfish build needs (see src/lib/stockfishEngine.ts).
        // Must be site-wide: with client-side routing the isolation state is
        // fixed by whichever document the user first landed on, so scoping
        // these to the chess routes would silently downgrade the engine for
        // anyone who navigated there from another page. This also puts COEP on
        // the /stockfish/* worker scripts themselves, which browsers require
        // before letting a worker join an isolated page.
        // Safe here because the app embeds no cross-origin resources: no
        // external images/iframes, fonts self-hosted via next/font, and
        // Supabase/Socket.io use fetch/XHR/WebSockets which COEP doesn't gate.
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders(),
      },
      {
        // Engine assets are multi-MB and version-stamped in their filenames
        // (stockfish-18.0.8-*), so browsers may cache them forever. Never
        // overwrite these files — ship a new version under a new name.
        source: '/stockfish/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // There is deliberately no `/api` proxy to the game API. One sat in
  // `afterFiles`, commented "development only" but ungated, so production served
  // the whole API from this site's address. Every request through it reached the
  // API from Vercel's address rather than the caller's, which pooled strangers
  // into one per-address rate limit (security audit v2, GX-10). Nothing used it:
  // the client calls the API at its own address (packages/client apiFetch.ts and
  // the socket store).
  async rewrites() {
    return {
      beforeFiles: [
        {
          // One address, two Homes (ux-fix-ideas.md §4.1): a visitor who has
          // played here gets the launcher at `/`, a stranger the landing page.
          // The server cannot read localStorage, so the first game, saved setup
          // or solve sets this cookie (src/lib/returning.ts). A rewrite rather
          // than a cookie read in the page keeps both pages static.
          source: '/',
          has: [{ type: 'cookie', key: 'gx_returning' }],
          destination: '/home',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  // No `images` block: nothing renders through next/image, and every remote
  // host listed there is one /_next/image will fetch and resize on this
  // project's bill. The scaffold listed any path on `your-cdn-domain.com`, a
  // domain someone else owns, and any port on localhost (security audit v2,
  // GX-20). If next/image is adopted, list the one host with its pathname.
};

export default nextConfig;
