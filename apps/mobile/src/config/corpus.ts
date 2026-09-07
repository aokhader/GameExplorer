/**
 * Where the fetched puzzle corpus is served from.
 *
 * **Its own module, deliberately, and not part of `config/env.ts`.** That file
 * imports `@gameexplorer/db` to set the OAuth redirect, and `@gameexplorer/db`
 * builds a Supabase client at import time — so anything reaching for it drags
 * Supabase into the graph. `PuzzleScreen` deep-imports `usePuzzle` for exactly
 * that reason, and taking the corpus URL from `env.ts` undid it: the screen's
 * Jest suite stopped running with *"Your project's URL and API key are
 * required"*, which is that boundary failing loudly rather than a test problem.
 *
 * The **web** origin, not the API's: the pages are static files under
 * `apps/web/public/puzzles/`, so they ride the CDN and need no endpoint, no
 * table and no auth. The deployed site is the default rather than localhost —
 * a dev build with no local web server should still find puzzles, and failing
 * that the layered source falls back to the bundled core.
 */
export function puzzleCorpusUrl(): string {
  const site = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://game-explorer-site.vercel.app';
  return `${site.replace(/\/$/, '')}/puzzles`;
}
