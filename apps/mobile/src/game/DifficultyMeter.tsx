import { View } from 'react-native';
import { COLORS, RADIUS, SPACING, useThemeName } from '@gameexplorer/ui';

/**
 * A bot tier's strength as rising bars, filled up to the tier — the mobile twin
 * of web's `components/game/DifficultyMeter.tsx`.
 *
 * It replaced a coloured emoji dot per tier (green, blue, yellow, orange, red,
 * black or purple). Those were a different drawing on every platform, could not
 * take a theme colour, and ranked the tiers by colour alone, which a colour-blind
 * player cannot read. Bar count carries the rank; colour only says which tile is
 * selected.
 *
 * Decorative: the tile it sits on already names the tier.
 */
export function DifficultyMeter({ level, of, color }: {
  /** 1-based position of this tier on its ladder. */
  level: number;
  /** How many tiers the ladder has. */
  of: number;
  /** Fill for the lit bars — usually the game accent when selected, else `COLORS.fgMuted`. */
  color: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACING['0.5'], height: 16, marginBottom: 6 }}
    >
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={{
            width: 4,
            // Rising, so the row reads as a scale even at a glance.
            height: 6 + Math.round((10 * i) / Math.max(1, of - 1)),
            borderRadius: RADIUS.xs,
            backgroundColor: i < level ? color : COLORS.border,
          }}
        />
      ))}
    </View>
  );
}
