/**
 * Picks the right Stockfish build for the current browser.
 *
 * Filenames are versioned (stockfish-18.0.8-*) because /stockfish/* is served
 * with `Cache-Control: immutable` (see next.config.ts) — upgrading the engine
 * means adding new files under a new version, never overwriting these.
 *
 * The multi-threaded build needs SharedArrayBuffer, which browsers only
 * expose on cross-origin-isolated pages (COOP+COEP headers, also set in
 * next.config.ts). When isolation is missing — old deploy previews, browsers
 * without support — we fall back to the single-threaded build, which behaves
 * exactly as before Phase B: `go` blocks its worker thread, so searches are
 * only interruptible by expiring, not by `stop`.
 */

const MT_ENGINE_PATH = '/stockfish/stockfish-18.0.8-lite.js';
const ST_ENGINE_PATH = '/stockfish/stockfish-18.0.8-lite-single.js';

export function isMultiThreadSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated === true
  );
}

export function getStockfishEnginePath(): string {
  return isMultiThreadSupported() ? MT_ENGINE_PATH : ST_ENGINE_PATH;
}

/**
 * Search threads for the multi-threaded build: leave a couple of cores for
 * the main thread / OS so the UI never starves, cap so laptops don't spin
 * their fans over a casual analysis session.
 */
export function getStockfishThreads(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return Math.max(1, Math.min(cores - 2, 8));
}
