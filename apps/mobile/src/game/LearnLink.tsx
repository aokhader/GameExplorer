import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface LearnLinkProps {
  game: 'chess' | 'checkers' | 'reversi';
  /** Each game words its invitation slightly differently. */
  label: string;
}

/**
 * The tutorial link on a game's setup screen.
 *
 * One component for all three games because the link is identical apart from
 * the accent and the wording — it used to be pasted into each screen. Puzzles
 * briefly sat next to it and is now a tile in the mode picker instead, which is
 * where a player looks for something to play rather than something to read.
 */
export function LearnLink({ game, label }: LearnLinkProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/learn/${game}` as never)}
      accessibilityRole="link"
      accessibilityLabel={`How to play ${game}`}
      hitSlop={8}
      style={{ alignSelf: 'center', marginTop: -12, marginBottom: 22 }}
    >
      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: GAME_ACCENTS[game].base }}>
        {label}
      </Text>
    </Pressable>
  );
}
