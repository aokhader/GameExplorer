import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { setLastPlayed, type GameKey } from '@/lib/lastPlayed';
import { CheckersScreen } from '@/screens/CheckersScreen';
import { ReversiScreen } from '@/screens/ReversiScreen';
import { ChessScreen } from '@/screens/ChessScreen';

const LABELS: Record<string, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
};

/**
 * Per-game entry point. All three games ship a native board vs bot as of M3
 * (checkers M2; reversi + chess M3). The placeholder now only shows for an
 * unknown game key.
 */
export default function GameScreen() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? 'chess').toLowerCase();

  // Remember the game so the tab bar's Play button reopens it next time.
  useEffect(() => {
    if (key === 'chess' || key === 'checkers' || key === 'reversi') {
      setLastPlayed(key as GameKey);
    }
  }, [key]);

  if (key === 'checkers') return <CheckersScreen />;
  if (key === 'reversi') return <ReversiScreen />;
  if (key === 'chess') return <ChessScreen />;

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
