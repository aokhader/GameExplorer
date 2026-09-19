import { Text, View } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, SPACING } from '@gameexplorer/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';

const NAMES = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
  liquidate: 'Liquidate',
} as const;

export type SetupHeadingGame = keyof typeof NAMES;

/**
 * A setup screen's title: the game's piece art and its name, on one row.
 *
 * It replaces `SetupHero` — an 80pt glowing accent badge over "Play Chess" in
 * the display face and a line of filler copy, on a bloom of the game's neon —
 * which pushed the first choice a third of the way down a phone
 * (`project-docs/ux-fix-ideas.md` §6.3: a title is a heading, not a hero). The
 * piece art is the game's identity; nothing here glows.
 */
export function SetupHeading({ game }: { game: SetupHeadingGame }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3], marginBottom: 20 }}
    >
      <GamePieceIcon game={game} size={32} />
      <Text style={{ fontFamily: FONTS.display, fontSize: FONT_SIZES['2xl'], color: COLORS.fg }}>
        {NAMES[game]}
      </Text>
    </View>
  );
}
