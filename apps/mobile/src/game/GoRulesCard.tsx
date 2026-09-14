import { Pressable, Text, View } from 'react-native';
import type { GoScoring } from '@gameexplorer/shared';
import {
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_SCORING_OPTIONS,
  goRatedEligibility,
} from '@gameexplorer/client/game/goSetup';
import { COLORS, GAME_ACCENTS, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface GoRulesCardProps {
  size: number;
  onSizeChange: (size: number) => void;
  komi: number;
  onKomiChange: (komi: number) => void;
  scoring: GoScoring;
  onScoringChange: (scoring: GoScoring) => void;
  /**
   * Show the note explaining that these settings make the game casual. False in
   * pass-and-play, where nothing was going to be rated anyway.
   */
  showRatedNote?: boolean;
}

/** One segmented option. Plain object style, pressed state from the children function. */
function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={{
        borderRadius: RADIUS.xl,
        borderWidth: 2,
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: selected ? GAME_ACCENTS.go.tintBg : COLORS.surfaceAlt,
        borderColor: selected ? GAME_ACCENTS.go.base : COLORS.border,
      }}
    >
      <Text
        style={{
          color: selected ? GAME_ACCENTS.go.base : COLORS.fg,
          fontSize: FONT_SIZES.sm,
          fontFamily: FONTS.bodyBold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One labelled row of chips, plus the line explaining the current choice. */
function Choice<T extends string | number>({
  label,
  announce,
  options,
  value,
  onChange,
}: {
  label: string;
  /** How one option reads to a screen reader, which cannot see the group heading. */
  announce: (option: { label: string; description: string }) => string;
  options: readonly { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <View>
      <Text
        style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, marginBottom: 8 }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] }}>
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
            accessibilityLabel={announce(option)}
          />
        ))}
      </View>
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, marginTop: 8, lineHeight: 16 }}>
        {selected?.description}
      </Text>
    </View>
  );
}

/**
 * The three rules a Go game is set up with: how big the board is, how much
 * White gets for moving second, and how the board is counted at the end.
 *
 * Rendered in **every** mode, unlike the bot tier and the rated toggle — all
 * three apply just as much to two people sharing a phone.
 *
 * The line under each row is the point of the card. "Territory" and "area" mean
 * nothing to a new player, and a setting nobody understands is worse than no
 * setting at all.
 */
export function GoRulesCard({
  size,
  onSizeChange,
  komi,
  onKomiChange,
  scoring,
  onScoringChange,
  showRatedNote = false,
}: GoRulesCardProps) {
  // One shared rule, so this card and the web one cannot disagree about what
  // counts as rated.
  const eligibility = goRatedEligibility({ size, komi });

  return (
    <View
      style={{
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        marginBottom: 24,
        gap: SPACING[4],
      }}
    >
      <Choice
        label="Board"
        options={GO_BOARD_SIZES}
        value={size}
        onChange={onSizeChange}
        announce={(o) => `${o.label} board — ${o.description}`}
      />
      <Choice
        label="Scoring"
        options={GO_SCORING_OPTIONS}
        value={scoring}
        onChange={onScoringChange}
        announce={(o) => `${o.label} scoring — ${o.description}`}
      />
      <Choice
        label="Komi"
        options={GO_KOMI_PRESETS}
        value={komi}
        onChange={onKomiChange}
        announce={(o) => `Komi ${o.label} — ${o.description}`}
      />

      {showRatedNote && !eligibility.rated && (
        <Text
          accessibilityRole="text"
          style={{ color: COLORS.warning, fontSize: FONT_SIZES.xs, lineHeight: 16 }}
        >
          {eligibility.reason}
        </Text>
      )}
    </View>
  );
}
