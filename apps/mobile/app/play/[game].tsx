import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Icon } from '@/components/ui';
import { isGameKey, setLastPlayed } from '@/lib/lastPlayed';
import { CheckersScreen } from '@/screens/CheckersScreen';
import { ReversiScreen } from '@/screens/ReversiScreen';
import { ChessScreen } from '@/screens/ChessScreen';
import { GoScreen } from '@/screens/GoScreen';
import { LiquidateScreen } from '@/screens/LiquidateScreen';
import { FONTS } from '@/theme/typography';

const LABELS: Record<string, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
  liquidate: 'Liquidate',
};

/**
 * Per-game entry point. Every game in the catalog ships a native screen — the
 * three board games vs bot (checkers M2; reversi + chess M3) and Liquidate's
 * property loop. The placeholder now only shows for an unknown game key.
 */
export default function GameScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? 'chess').toLowerCase();

  // Remember the game so the tab bar's Play button reopens it next time.
  useEffect(() => {
    if (isGameKey(key)) setLastPlayed(key);
  }, [key]);

  if (key === 'checkers') return <CheckersScreen />;
  if (key === 'reversi') return <ReversiScreen />;
  if (key === 'chess') return <ChessScreen />;
  if (key === 'go') return <GoScreen />;
  if (key === 'liquidate') return <LiquidateScreen />;

  const label = LABELS[key] ?? 'Game';
  const accent = GAME_ACCENTS[key as keyof typeof GAME_ACCENTS]?.base ?? COLORS.accent;

  return (
    <Screen scroll={false}>
      <BackHeader title={label} fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING[3] }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: RADIUS['3xl'],
            backgroundColor: COLORS.surfaceAlt,
            borderWidth: 2,
            borderColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="question" size={FONT_SIZES['4xl']} color={accent} />
        </View>
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.xl, fontFamily: FONTS.display }}>
          {label} is on the way
        </Text>
        <Text
          style={{
            color: COLORS.fgMuted,
            fontSize: FONT_SIZES.body,
            textAlign: 'center',
            maxWidth: 280,
            lineHeight: 22,
          }}
        >
          The native board and vs-bot play arrive in the next update. Sign in now to carry your
          ratings and history across devices.
        </Text>
      </View>
    </Screen>
  );
}
