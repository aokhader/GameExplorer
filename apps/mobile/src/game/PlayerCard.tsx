import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';

export interface PlayerCardProps {
  /** Display name, e.g. "Bot" or "You". */
  name: string;
  /** Single-letter avatar initial. */
  initial: string;
  /** Small line under the name — difficulty or a status like "your move". */
  subline?: string;
  /** The local player's card wears a gold tint so "you" is always identifiable. */
  isYou?: boolean;
  /** Pulsing "to move" dot on the right. */
  active?: boolean;
}

/**
 * The Arcade Glow player card — native port of web's `PlayerCard`. Avatar tile +
 * name + status subline, with a pulsing "to move" dot on the right. Shared by
 * every in-game screen so single-player boards look identical to (future)
 * multiplayer ones.
 */
export function PlayerCard({ name, initial, subline, isYou = false, active = false }: PlayerCardProps) {
  const { reducedMotion } = useSettings();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (active && !reducedMotion) {
      pulse.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
    return () => cancelAnimation(pulse);
  }, [active, reducedMotion, pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const dotColor = isYou ? COLORS.accent : COLORS.success;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        backgroundColor: isYou ? COLORS.accentMuted : COLORS.surfaceAlt,
        borderColor: isYou ? 'rgba(205,164,63,0.35)' : COLORS.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isYou ? COLORS.accent : COLORS.info,
          }}
        >
          <Text style={{ color: isYou ? COLORS.onAccent : '#fff', fontSize: 16, fontWeight: '800' }}>
            {initial}
          </Text>
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
            {name}
          </Text>
          {subline && (
            <Text
              style={{ color: isYou ? COLORS.accent : COLORS.fgMuted, fontSize: 12, marginTop: 1 }}
              numberOfLines={1}
            >
              {subline}
            </Text>
          )}
        </View>
      </View>
      {active && (
        <Animated.View
          style={[
            { width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor },
            dotStyle,
          ]}
        />
      )}
    </View>
  );
}
