import {
  CheckersPiece,
  ChessPiece,
  GoStone,
  PlanetToken,
  ReversiDisc,
  useThemeName,
} from '@finesse/ui';

export type GameKey = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

/**
 * A game's identity piece, drawn from the Game Pieces art ("Game Pieces" design
 * system) at icon scale. Stands in for the Unicode glyphs the mobile design doc
 * mocked these tiles with (♞ / ⛃ / ⚫): those render as black-by-default text or
 * get emoji-font substitution on Android, so they never matched the mock.
 *
 * The light-side chess and checkers pieces read against the accent tint tiles;
 * reversi uses the black disc, whose lime halo is its own accent.
 *
 * Web mirrors this switch in `apps/web/src/components/game/GameIcon.tsx` over the
 * same `@finesse/ui` art, so both clients draw the same icon for a game. The
 * two resolvers stay separate rather than shared because `packages/ui` is a leaf
 * that cannot import the game catalog, and a shared component would have to pick
 * a renderer.
 */
export function GamePieceIcon({ game, size }: { game: GameKey; size: number }) {
  // Repaint when the theme changes; the tokens read below are live views.
  useThemeName();

  switch (game) {
    case 'chess':
      return <ChessPiece type="knight" color="white" size={size} />;
    case 'checkers':
      return <CheckersPiece type="king" color="white" size={size} />;
    // The white stone, so Go reads apart from reversi's black disc at icon size —
    // the two games' pieces are both plain circles, and the shading is the only
    // thing that separates them that small.
    case 'go':
      return <GoStone color="white" size={size} />;
    case 'liquidate':
      return <PlanetToken size={size} />;
    case 'reversi':
      return <ReversiDisc color="black" size={size} />;
  }
  // `game` is `never` here, so an unhandled id is a compile error rather than a
  // silent render. It used to fall through to the reversi disc, which mattered
  // because the profile screens reach this via a cast on a stored `game_type`:
  // a row written by a newer build would have drawn as reversi with no warning.
  return null;
}
