import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS, FONT_SIZES, MOTION, RADIUS, SPACING } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import { finitePulseCount, timing } from '@/theme/motion';

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
  /**
   * Trailing content on the name row, left of the "to move" dot — multiplayer
   * puts the player's clock here, matching web's `PlayerCard` right slot.
   */
  right?: ReactNode;
  /**
   * Optional second row inside the card, under the name — chess uses it for the
   * capture tray. Renders nothing (and adds no spacing) when omitted, so the
   * other games keep the original one-line card.
   */
  footer?: ReactNode;
}

/**
 * The Arcade Glow player card — native port of web's `PlayerCard`. Avatar tile +
 * name + status subline, with a pulsing "to move" dot on the right. Shared by
 * every in-game screen so single-player boards look identical to (future)
 * multiplayer ones.
 */
export function PlayerCard({
  name,
  initial,
  subline,
  isYou = false,
  active = false,
  right,
  footer,
}: PlayerCardProps) {
  const { reducedMotion } = useSettings();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (active && !reducedMotion) {
      // Finite on purpose. An opponent's turn can outlast any pulse worth
      // watching, and an infinite repeat keeps Android from ever reaching idle.
      // The even count leaves the dot lit when the pulse ends.
      pulse.value = withRepeat(
        withTiming(0.35, timing('slower', 'standard')),
        finitePulseCount(MOTION.DURATION.slower),
        true,
      );
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
        gap: SPACING[2],
        borderRadius: RADIUS.xl,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        backgroundColor: isYou ? COLORS.accentMuted : COLORS.surfaceAlt,
        borderColor: isYou ? COLORS.accent : COLORS.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACING[3],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3], flexShrink: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: RADIUS.xl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isYou ? COLORS.accent : COLORS.info,
            }}
          >
            <Text style={{ color: isYou ? COLORS.onAccent : '#fff', fontSize: FONT_SIZES.base, fontFamily: FONTS.bodyBold }}>
              {initial}
            </Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.body, fontFamily: FONTS.bodyBold }} numberOfLines={1}>
              {name}
            </Text>
            {subline && (
              <Text
                style={{ color: isYou ? COLORS.accent : COLORS.fgMuted, fontSize: FONT_SIZES.xs, marginTop: 1 }}
                numberOfLines={1}
              >
                {subline}
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING['2.5'] }}>
          {right}
          {active && (
            <Animated.View
              style={[
                { width: 10, height: 10, borderRadius: RADIUS.full, backgroundColor: dotColor },
                dotStyle,
              ]}
            />
          )}
        </View>
      </View>
      {footer}
    </View>
  );
}
