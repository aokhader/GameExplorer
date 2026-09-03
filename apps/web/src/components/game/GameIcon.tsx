import {
  CheckersPiece,
  ChessPiece,
  GoStone,
  PlanetToken,
  ReversiDisc,
} from '@finesse/ui';
import type { GameId } from '@finesse/shared';

/**
 * A game's identity icon — the single source for "what does this game look like"
 * on web.
 *
 * Web used to carry five separate glyph maps (home, welcome tour, profile,
 * tutorial header, spectate lobby) plus inline literals on each hub hero, and
 * they disagreed: chess was ♔, ♞ or ♟ depending on the page, checkers was ⚫,
 * 🔴, ⛃ or ⛀, and reversi was ⚪ on the home tile but ⚫ everywhere else. This
 * replaces all of them with the same `@finesse/ui` vector art mobile already
 * draws (`apps/mobile/src/game/GamePieceIcon.tsx`), so a game looks the same on
 * every surface and on both platforms.
 *
 * The two resolvers stay per-platform rather than shared: `packages/ui` is a leaf
 * and cannot import the game catalog from `packages/shared`, and a shared
 * component would have to choose between React DOM and React Native rendering.
 * Two thin switches over one shared art layer is the honest factoring.
 *
 * `size` defaults to `1em` so the icon scales off whatever `text-*` class already
 * wraps it — that is what let these drop in where a glyph used to sit without
 * touching a single type scale.
 */
export function GameIcon({
  game,
  size = '1em',
  className,
}: {
  game: GameId;
  size?: number | string;
  className?: string;
}) {
  switch (game) {
    case 'chess':
      return <ChessPiece type="knight" color="white" size={size} className={className} />;
    case 'checkers':
      return <CheckersPiece type="king" color="white" size={size} className={className} />;
    // The white stone, so Go reads apart from reversi's black disc at icon size —
    // both are plain circles and the shading is all that separates them that small.
    case 'go':
      return <GoStone color="white" size={size} className={className} />;
    case 'liquidate':
      return <PlanetToken size={size} className={className} />;
    case 'reversi':
      return <ReversiDisc color="black" size={size} className={className} />;
  }
  // `game` is `never` here — an unhandled id is a compile error, not a silent
  // render of the wrong game.
  return null;
}
