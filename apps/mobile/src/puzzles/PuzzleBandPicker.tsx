import { Pressable, Text, View } from 'react-native';
import { PUZZLE_BANDS, type PuzzleBand, type PuzzleGame } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { Icon } from '@/components/ui/Icon';

/**
 * Choose which strength of puzzle to solve — the native twin of web's picker.
 *
 * The bands are named after the bot tiers, so "Club" here and "Club" on the
 * setup screen's strength grid are the same claim about the same strength. That
 * equivalence is the point of the mode: it is how a player finds out what a
 * rated game at their own rating looks like without losing one.
 *
 * Each tile shows progress through its band rather than how many exist. "3 / 8"
 * is the number a player tracks; a bare count told them nothing about what they
 * had done. A band with no content says so with a dash rather than "0", because
 * "0" reads as "you have solved none" instead of "there are none yet".
 */
export interface PuzzleBandPickerProps {
  game: PuzzleGame;
  band: PuzzleBand;
  counts: Record<string, number>;
  solved: Record<string, number>;
  onSelect: (id: string) => void;
  /** The player's own rating in this game, when they have one. */
  rating?: number | null;
}

export function PuzzleBandPicker({
  game,
  band,
  counts,
  solved,
  onSelect,
  rating,
}: PuzzleBandPickerProps) {
  // Repaint on theme change: every token read below is a live view, and reading
  // them at module scope would freeze this card to whichever palette was active
  // at import (`noFrozenTokens.test.ts` fails the build on that pattern).
  useThemeName();
  const accent = GAME_ACCENTS[game];

  return (
    <View
      style={{
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 12,
        gap: SPACING['2.5'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.label, fontFamily: FONTS.displaySemi }}>
          Difficulty
        </Text>
        {typeof rating === 'number' && (
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.caption }}>your rating: {rating}</Text>
        )}
      </View>

      {/* A wrapping row, never a nested vertical ScrollView — one inside
          `GameScreenLayout`'s own ScrollView collapses to zero height, and the
          whole card would silently render as nothing. */}
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING['1.5'] }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Puzzle difficulty band"
      >
        {PUZZLE_BANDS[game].map((b) => {
          const selected = b.id === band.id;
          const count = counts[b.id] ?? 0;
          const done = solved[b.id] ?? 0;
          const complete = count > 0 && done >= count;
          return (
            <Pressable
              key={b.id}
              testID={`puzzle-band-${b.id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={
                count === 0
                  ? `${b.label}, around ${b.tierElo} rating, no puzzles yet`
                  : `${b.label}, around ${b.tierElo} rating, ${done} of ${count} solved`
              }
              onPress={() => onSelect(b.id)}
              // A plain object, with the pressed state read from the children
              // function — the way every control in this app is written.
              style={{
                flexGrow: 1,
                flexBasis: '30%',
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor: selected ? accent.base : COLORS.border,
                backgroundColor: selected ? accent.tintBg : COLORS.surface,
                paddingHorizontal: 8,
                paddingVertical: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[1] }}>
                <Text
                  style={{
                    color: selected ? COLORS.fg : COLORS.fgMuted,
                    fontSize: FONT_SIZES.caption,
                    fontFamily: FONTS.bodyBold,
                  }}
                >
                  {b.label}
                </Text>
                {complete && (
                  <Icon name="check" size={FONT_SIZES.xs} color={COLORS.successHover} label="Completed" />
                )}
              </View>
              <Text
                testID={`puzzle-band-${b.id}-progress`}
                style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES['2xs'] }}
              >
                {count === 0 ? `${b.tierElo} · —` : `${b.tierElo} · ${done}/${count}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
