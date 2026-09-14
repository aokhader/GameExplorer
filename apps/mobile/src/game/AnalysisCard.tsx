import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { Icon } from '@/components/ui/Icon';

/** The two games with an engine to ask. The other three have nothing to analyse. */
const ENTRIES = {
  chess: {
    href: '/analysis/chess',
    title: 'Analysis board',
    description: 'Set up any position and ask the engine',
  },
  go: {
    href: '/analysis/go',
    title: 'Game analysis',
    description: 'Paste a game as SGF and grade every move',
  },
} as const;

/**
 * The analysis entry on a game's setup screen.
 *
 * Built to match `OpponentPicker`'s tiles — same radius, border weight, padding
 * and type scale — because it is the same kind of choice from the player's side
 * of the screen: a thing this game can do. It was a line of tinted text above
 * the mode grid, which is where a link goes when nobody has decided how
 * important it is.
 *
 * It is deliberately NOT a tile inside the picker. Every tile there *selects* a
 * mode and stays lit; this one navigates away, and a tile that never shows a
 * selected state would be an invitation to wire selection into it later.
 */
export function AnalysisCard({ game }: { game: keyof typeof ENTRIES }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { href, title, description } = ENTRIES[game];
  const accent = GAME_ACCENTS[game].base;

  return (
    <Pressable
      onPress={() => router.push(href as never)}
      accessibilityRole="link"
      accessibilityLabel={`${title} — ${description}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[3],
        borderRadius: RADIUS['2xl'],
        borderWidth: 2,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 12,
        marginBottom: 24,
      }}
    >
      <Icon name="magnifying-glass" size={FONT_SIZES.xl} color={COLORS.fgMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.sm }}>
          {title}
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.caption, marginTop: 2 }}>
          {description}
        </Text>
      </View>
      {/* The one thing a mode tile never has: it goes somewhere. */}
      <Text style={{ color: accent, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.base }}>→</Text>
    </Pressable>
  );
}
