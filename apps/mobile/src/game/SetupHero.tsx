import { Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, GLOWS_NATIVE } from '@gameexplorer/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';

const META = {
  chess: { name: 'Chess', glow: GLOWS_NATIVE.glowChess },
  checkers: { name: 'Checkers', glow: GLOWS_NATIVE.glowCheckers },
  reversi: { name: 'Reversi', glow: GLOWS_NATIVE.glowReversi },
} as const;

export type SetupHeroGame = keyof typeof META;

/**
 * Setup-screen hero — the per-game hub identity from the mobile design:
 * a glowing accent icon badge over "Play {Game}". Shared by all three games;
 * pair it with a `GlowBackdrop` bloom in the same accent.
 */
export function SetupHero({ game }: { game: SetupHeroGame }) {
  const accent = GAME_ACCENTS[game];
  const meta = META[game];
  return (
    <View style={{ alignItems: 'center', marginBottom: 26 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accent.tintBg,
          borderWidth: 1,
          borderColor: accent.tintBorder,
          marginBottom: 16,
          boxShadow: meta.glow,
        }}
      >
        <GamePieceIcon game={game} size={48} />
      </View>
      <Text style={{ fontFamily: FONTS.display, fontSize: 32, color: COLORS.fg }}>
        Play <Text style={{ color: accent.light }}>{meta.name}</Text>
      </Text>
      <Text style={{ fontFamily: FONTS.body, fontSize: 15, color: COLORS.fgMuted, marginTop: 6 }}>
        Pick a mode and jump in.
      </Text>
    </View>
  );
}
