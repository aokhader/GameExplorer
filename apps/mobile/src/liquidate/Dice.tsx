import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { LIQUIDATE_TIMING } from '@gameexplorer/shared';
import { useSettings } from '@/providers/SettingsProvider';

/** Pip layout per face, on a 3×3 grid (indices 0–8). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export interface DiceProps {
  dice: [number, number] | null;
  /** Edge of one die, in px. */
  size?: number;
}

/**
 * The two dice, in the middle of the ring.
 *
 * A roll and its result arrive in the same engine update, so the faces tumble
 * for `diceTumbleMs` showing random values before settling on the real ones —
 * `timing.ts` explains why that number and the walk's lead-in are kept together.
 */
export function Dice({ dice, size = 26 }: DiceProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { reducedMotion } = useSettings();

  /**
   * The faces mid-tumble, or `null` once they have landed.
   *
   * Stored rather than derived because it is genuinely external state — an
   * interval's output. The *landed* value is not stored at all: it is `dice`,
   * read straight through below, so there is no second copy to fall out of sync
   * and nothing to set when a roll resolves.
   */
  const [tumbling, setTumbling] = useState<[number, number] | null>(null);
  const settle = useSharedValue(1);

  useEffect(() => {
    if (!dice || reducedMotion) return;

    let frame = 0;
    const spin = setInterval(() => {
      frame += 1;
      setTumbling([1 + ((frame * 3) % 6), 1 + ((frame * 5) % 6)]);
    }, 70);

    const land = setTimeout(() => {
      clearInterval(spin);
      setTumbling(null);
      settle.value = withSequence(
        withTiming(1.18, { duration: LIQUIDATE_TIMING.diceSettleMs * 0.45 }),
        withTiming(1, { duration: LIQUIDATE_TIMING.diceSettleMs * 0.55 }),
      );
    }, LIQUIDATE_TIMING.diceTumbleMs);

    return () => {
      clearInterval(spin);
      clearTimeout(land);
      cancelAnimation(settle);
    };
  }, [dice, reducedMotion, settle]);

  const shown: [number, number] = tumbling ?? dice ?? [1, 1];

  const style = useAnimatedStyle(() => ({ transform: [{ scale: settle.value }] }));

  return (
    <Animated.View style={[{ flexDirection: 'row', gap: 5 }, style]}>
      {shown.map((value, i) => (
        <Face key={i} value={value} size={size} />
      ))}
    </Animated.View>
  );
}

function Face({ value, size }: { value: number; size: number }) {
  const on = PIPS[value] ?? [];
  const pip = Math.max(3, Math.round(size * 0.15));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        borderWidth: 1,
        borderColor: LIQUIDATE_PANEL_COLORS.line,
        backgroundColor: LIQUIDATE_PANEL_COLORS.panel,
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: Math.round(size * 0.15),
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <View
          key={i}
          style={{ width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' }}
        >
          {on.includes(i) && (
            <View
              style={{
                width: pip,
                height: pip,
                borderRadius: pip / 2,
                backgroundColor: LIQUIDATE_PANEL_COLORS.ink,
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
