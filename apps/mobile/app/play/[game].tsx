import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { setLastPlayed, type GameKey } from '@/lib/lastPlayed';
import { CheckersScreen } from '@/screens/CheckersScreen';
import { ReversiScreen } from '@/screens/ReversiScreen';
import { ChessScreen } from '@/screens/ChessScreen';
import { LiquidateScreen } from '@/screens/LiquidateScreen';

const LABELS: Record<string, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
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
    if (key === 'chess' || key === 'checkers' || key === 'reversi' || key === 'liquidate') {
      setLastPlayed(key as GameKey);
    }
  }, [key]);

  if (key === 'checkers') return <CheckersScreen />;
  if (key === 'reversi') return <ReversiScreen />;
  if (key === 'chess') return <ChessScreen />;
  if (key === 'liquidate') return <LiquidateScreen />;

  const label = LABELS[key] ?? 'Game';
  const accent = GAME_ACCENTS[key as keyof typeof GAME_ACCENTS]?.base ?? COLORS.accent;

  return (
    <Screen scroll={false}>
      <BackHeader title={label} fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: COLORS.surfaceAlt,
            borderWidth: 2,
            borderColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 34 }}>{key === 'reversi' ? '⚫' : '♞'}</Text>
        </View>
        <Text style={{ color: COLORS.fg, fontSize: 20, fontWeight: '700' }}>
          {label} is on the way
        </Text>
        <Text
          style={{
            color: COLORS.fgMuted,
            fontSize: 15,
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
