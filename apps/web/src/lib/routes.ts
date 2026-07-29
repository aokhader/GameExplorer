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
 * Navigation is not lost: each shell has its own header with a back link to the
 * game's hub.
 *
 * **This predicate and those two shells must agree.** If a route renders one of
 * them but does not match here, it gets a 64px gap where the navbar used to be;
 * if it matches but renders neither, the page loses its nav for nothing.
 */
export function isImmersiveGameRoute(pathname: string): boolean {
  return (
    /\/(play|bot|training|analysis|local)(\/|$)/.test(pathname) ||
    pathname.startsWith('/spectate/')
  );
}
