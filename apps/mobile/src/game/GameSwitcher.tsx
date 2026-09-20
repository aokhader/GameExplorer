import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { GAME_LIST } from '@gameexplorer/shared';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';
import type { SetupHeadingGame } from '@/game/SetupHeading';

/**
 * The five games, on the setup screen, so *Play* lands somewhere a game can be
 * chosen as well as set up.
 *
 * The tab bar's Play used to resume the unfinished game, else reopen the last
 * game's setup — a good shortcut, but it meant the only way to a *different*
 * game was back to Home first, and a button whose destination changes is a
 * poor thing to have in a tab bar. The unfinished game is still one tap away:
 * this screen's Continue card is above the fold.
 *
 * Switching sets the route's parameter rather than pushing a screen: the games
 * are siblings, not a stack, and pushing one on top of another would leave Back
 * walking through every game that had been looked at. (`replace` is also the
 * call that crashes Fabric on the way into a game screen — see
 * `app/welcome.tsx`.)
 */
export function GameSwitcher({ game }: { game: SetupHeadingGame }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const router = useRouter();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: SPACING[2], paddingBottom: SPACING[1] }}
      style={{ marginBottom: 20 }}
    >
      {GAME_LIST.map((entry) => {
        const selected = entry.id === game;
        return (
          <Pressable
            key={entry.id}
            onPress={() => {
              if (!selected) router.setParams({ game: entry.id });
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={entry.name}
            hitSlop={4}
            style={{
              alignItems: 'center',
              gap: SPACING[1],
              minWidth: 64,
              paddingHorizontal: SPACING[2],
              paddingVertical: SPACING[2],
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: selected ? COLORS.accent : COLORS.border,
              backgroundColor: selected ? COLORS.accentMuted : COLORS.surfaceAlt,
            }}
          >
            <GamePieceIcon game={entry.id as SetupHeadingGame} size={22} />
            <Text
              style={{
                fontFamily: selected ? FONTS.bodyBold : FONTS.bodySemi,
                fontSize: FONT_SIZES.caption,
                color: selected ? COLORS.fg : COLORS.fgMuted,
              }}
            >
              {entry.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
