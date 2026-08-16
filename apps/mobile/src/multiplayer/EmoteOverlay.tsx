import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import type { FloatingReaction } from './useEmotes';

export interface EmoteOverlayProps {
  reactions: FloatingReaction[];
}

/**
 * Transient reaction bubbles floating above the game, the native counterpart to
 * the fixed stack at the bottom of web's `EmoteBar`.
 *
 * `pointerEvents="none"` is load-bearing: the overlay covers the lower half of
 * the screen, which on a phone is the board. Without it a reaction arriving
 * mid-drag would swallow the touch that was about to make a move.
 */
export function EmoteOverlay({ reactions }: EmoteOverlayProps) {
  if (reactions.length === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 96,
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {reactions.map((r) => (
        <Bubble key={r.id} reaction={r} />
      ))}
    </View>
  );
}

function Bubble({ reaction }: { reaction: FloatingReaction }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { reducedMotion } = useSettings();

  const opacity = useSharedValue(0);
  const lift = useSharedValue(reducedMotion ? 0 : 16);

  useEffect(() => {
    if (reducedMotion) {
      // Still fade — an emoji that pops in and vanishes with no transition
      // reads as a glitch — but skip the travel.
      opacity.value = withTiming(1, { duration: 150 });
      return;
    }
    opacity.value = withTiming(1, { duration: 180 });
    lift.value = withTiming(-24, { duration: 2800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${reaction.username} reacted ${reaction.emote}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: reaction.mine ? 'flex-end' : 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 34 }}>{reaction.emote}</Text>
      <Text
        style={{
          color: COLORS.fgMuted,
          fontFamily: FONTS.body,
          fontSize: 11,
          backgroundColor: COLORS.surfaceAlt,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 8,
          paddingHorizontal: 6,
          paddingVertical: 2,
          overflow: 'hidden',
        }}
      >
        {reaction.username}
      </Text>
    </Animated.View>
  );
}
