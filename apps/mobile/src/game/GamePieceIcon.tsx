import {
  CheckersPiece,
  ChessPiece,
  GoStone,
  LIQUIDATE_BOARD_COLORS,
  PlayerToken,
  ReversiDisc,
  useThemeName,
} from '@gameexplorer/ui';
import { seatColor } from '@/liquidate/lqTheme';

export type GameKey = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

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
  // Repaint when the theme changes; the tokens read below are live views.
  useThemeName();

  if (game === 'chess') return <ChessPiece type="knight" color="white" size={size} />;
  if (game === 'checkers') return <CheckersPiece type="king" color="white" size={size} />;
  // The white stone, so Go reads apart from reversi's black disc at icon size —
  // the two games' pieces are both plain circles, and the shading is the only
  // thing that separates them that small.
  if (game === 'go') return <GoStone color="white" size={size} />;
  if (game === 'liquidate') {
    // The first seat's colour — the "you" hue every Liquidate screen follows.
    return (
      <PlayerToken
        color={seatColor(0)}
        outline={LIQUIDATE_BOARD_COLORS.tile}
        width={Math.round(size * 0.72)}
      />
    );
  }
  return <ReversiDisc color="black" size={size} />;
}
