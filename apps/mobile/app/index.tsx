import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GAME_ACCENTS } from '@gameexplorer/ui';

/**
 * Home hub — scaffold placeholder (M0). Proves the token system + NativeWind +
 * safe-area wiring render correctly on device. M1 turns these cards into
 * expo-router navigation to each game's setup screen.
 */
const GAMES = [
  { key: 'chess', label: 'Chess', accent: GAME_ACCENTS.chess.base },
  { key: 'checkers', label: 'Checkers', accent: GAME_ACCENTS.checkers.base },
  { key: 'reversi', label: 'Reversi', accent: GAME_ACCENTS.reversi.base },
] as const;

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 px-5 pt-6">
        <Text className="text-fg text-3xl font-bold">GameExplorer</Text>
        <Text className="text-fg-muted text-base mt-1">Pick a game to play</Text>

        <View className="mt-8 gap-4">
          {GAMES.map((g) => (
            <Pressable
              key={g.key}
              className="bg-surface-alt border border-border rounded-xl px-5 py-6 active:opacity-80"
              style={{ borderLeftColor: g.accent, borderLeftWidth: 4 }}
            >
              <Text className="text-fg text-xl font-semibold">{g.label}</Text>
              <Text className="text-fg-subtle text-sm mt-1">Play vs bot · Pass &amp; play</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
