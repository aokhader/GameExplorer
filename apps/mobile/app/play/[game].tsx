import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { CheckersScreen } from '@/screens/CheckersScreen';

const LABELS: Record<string, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
};

/**
 * Per-game entry point. Checkers ships in M2 (setup → native board vs bot);
 * chess + reversi land in M3 and keep the placeholder until then.
 */
export default function GameScreen() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? 'chess').toLowerCase();

  if (key === 'checkers') return <CheckersScreen />;

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
