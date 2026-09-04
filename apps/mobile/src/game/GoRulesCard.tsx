import { Pressable, Text, View } from 'react-native';
import type { GoScoring } from '@gameexplorer/shared';
import {
  GO_KOMI_PRESETS,
  GO_RATED_KOMI,
  GO_SCORING_OPTIONS,
} from '@gameexplorer/client/game/goSetup';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface GoRulesCardProps {
  komi: number;
  onKomiChange: (komi: number) => void;
  scoring: GoScoring;
  onScoringChange: (scoring: GoScoring) => void;
  /**
   * Show the note explaining that a non-standard komi makes the game casual.
   * False in pass-and-play, where nothing was going to be rated anyway.
   */
  showRatedNote?: boolean;
}

/** One segmented option. Plain object style — see `project_pressable_style_nativewind`. */
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
        borderRadius: 12,
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
          fontSize: 14,
          fontFamily: FONTS.bodyBold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The two rules a Go game is set up with: how much White gets for moving
 * second, and how the board is counted at the end.
 *
 * Rendered in **every** mode, unlike the bot tier and the rated toggle — komi
 * and the scoring rule apply just as much to two people sharing a phone.
 *
 * The line under each row is the point of the card. "Territory" and "area" mean
 * nothing to a new player, and a setting nobody understands is worse than no
 * setting at all.
 */
export function GoRulesCard({
  komi,
  onKomiChange,
  scoring,
  onScoringChange,
  showRatedNote = false,
}: GoRulesCardProps) {
  const scoringOption = GO_SCORING_OPTIONS.find((o) => o.value === scoring);
  const komiPreset = GO_KOMI_PRESETS.find((k) => k.value === komi);
  const unrated = showRatedNote && komi !== GO_RATED_KOMI;

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        marginBottom: 24,
        gap: 16,
      }}
    >
      <View>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 8 }}>
          Scoring
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GO_SCORING_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={scoring === option.value}
              onPress={() => onScoringChange(option.value)}
              accessibilityLabel={`${option.label} scoring — ${option.description}`}
            />
          ))}
        </View>
        <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 8, lineHeight: 16 }}>
          {scoringOption?.description}
        </Text>
      </View>

      <View>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 8 }}>
          Komi
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GO_KOMI_PRESETS.map((preset) => (
            <Chip
              key={preset.value}
              label={preset.label}
              selected={komi === preset.value}
              onPress={() => onKomiChange(preset.value)}
              accessibilityLabel={`Komi ${preset.label} — ${preset.description}`}
            />
          ))}
        </View>
        <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 8, lineHeight: 16 }}>
          {komiPreset?.description}
        </Text>
        {unrated && (
          <Text
            accessibilityRole="text"
            style={{ color: COLORS.warning, fontSize: 12, marginTop: 8, lineHeight: 16 }}
          >
            Games away from {GO_RATED_KOMI} komi are casual — komi is worth about seven
            points here, and the bot’s tiers were measured at {GO_RATED_KOMI}.
          </Text>
        )}
      </View>
    </View>
  );
}
