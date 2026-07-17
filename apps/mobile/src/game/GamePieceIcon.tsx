import { CheckersPiece, ChessPiece, ReversiDisc } from '@gameexplorer/ui';

export type GameKey = 'chess' | 'checkers' | 'reversi';

/**
 * A game's identity piece, drawn from the Game Pieces art ("Game Pieces" design
 * system) at icon scale. Stands in for the Unicode glyphs the mobile design doc
 * mocked these tiles with (♞ / ⛃ / ⚫): those render as black-by-default text or
 * get emoji-font substitution on Android, so they never matched the mock.
 *
 * The light-side chess and checkers pieces read against the accent tint tiles;
 * reversi uses the black disc, whose lime halo is its own accent.
 */
export function GamePieceIcon({ game, size }: { game: GameKey; size: number }) {
  if (game === 'chess') return <ChessPiece type="knight" color="white" size={size} />;
  if (game === 'checkers') return <CheckersPiece type="king" color="white" size={size} />;
  return <ReversiDisc color="black" size={size} />;
}
