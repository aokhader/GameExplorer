/**
 * Routes where the app gets out of the way and the board is the whole page.
 *
 * On these, the global `Navigation` bar is not rendered at all and the two
 * in-game shells (`GameScreenLayout`, `GameLayout`) drop the `pt-16` that
 * reserves space for it. The board is square, so every pixel of chrome removed
 * from the top is a pixel it grows by in BOTH directions — on a 700px-tall
 * laptop that is the difference between the board fitting and the page needing
 * to scroll under a fixed header.
 *
 * Navigation is not lost: each shell has its own header, carrying a link home
 * and a back link to the game's hub.
 *
 * **This predicate and those two shells must agree.** If a route renders one of
 * them but does not match here, the fixed navbar is drawn OVER the shell, which
 * starts at the top of the viewport — the top ~64px of the board and of the
 * header above it disappear behind it. (That is what a lesson did: it renders
 * `GameScreenLayout`, and `learn/<slug>` was missing from the list below.) If a
 * route matches but renders neither shell, the page loses its nav for nothing.
 *
 * A single lesson is immersive; `/<game>/learn`, the index that lists them, is
 * an ordinary page and keeps the navbar.
 */
export function isImmersiveGameRoute(pathname: string): boolean {
  return (
    // A game's own screens, not a top-level page that happens to share a word:
    // `/play` is the game picker and keeps its navigation, while `/chess/play`
    // is a board and does not.
    /^\/[^/]+\/(play|bot|training|analysis|local|puzzles)(\/|$)/.test(pathname) ||
    /\/learn\/[^/]+/.test(pathname) ||
    pathname.startsWith('/spectate/') ||
    // A saved game's review is the whole page, with its own way home.
    pathname.startsWith('/review/')
  );
}
