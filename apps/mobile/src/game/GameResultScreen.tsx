import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { HINT_PENALTY } from '@/engine/trainingRules';

export type GameResult = 'win' | 'loss' | 'draw' | 'aborted';

export interface GameResultScreenProps {
  open: boolean;
  result: GameResult;
  /** Headline override; defaults from `result`. */
  title?: string;
  /** Secondary line, e.g. the end reason. */
  subtitle?: string;
  /** Optional rating change block with an animated count-up. */
  rating?: { before: number; after: number; delta: number };
  /**
   * Training only — hints taken this game. Their cost is already inside
   * `rating.delta`, so the line explains where the points went.
   */
  hintsUsed?: number;
  /** The rated save/rating write failed (offline etc.) — show an error + retry. */
  saveError?: boolean;
  /** Re-attempt the failed save. Required when `saveError` can be true. */
  onRetrySave?: () => void;
  /** Action buttons (Play Again / Back) supplied by the screen. */
  actions: React.ReactNode;
  /**
   * Open game review. Rendered above the other actions when supplied — right
   * after a loss is the moment a player most wants to know what went wrong.
   */
  onReview?: () => void;
}

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const COPY: Record<GameResult, { emoji: string; heading: string; accentHeading?: true }> = {
  win: { emoji: '🏆', heading: 'You Won!', accentHeading: true },
  loss: { emoji: '💪', heading: 'Good Game' },
  draw: { emoji: '🤝', heading: 'Draw' },
  aborted: { emoji: '🛑', heading: 'Game Aborted' },
};

/** Animate an integer from `from` to `to` while `active` (rAF-based). */
function useCountUp(from: number, to: number, active: boolean, durationMs = 800): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, active, durationMs]);
  // When not animating, show the final value directly (no setState in effect).
  return active ? value : to;
}

/**
 * Game-over celebration — native port of web's `GameResultScreen`. A spring-in
 * card over a dim backdrop, an emoji pop, an optional rating count-up, and a
 * terminal chime/haptic. (Web's canvas-confetti has no RN drop-in yet; the
 * spring + emoji pop carry the moment — confetti is a M5 polish item.)
 */
export function GameResultScreen({
  open,
  result,
  title,
  subtitle,
  rating,
  hintsUsed = 0,
  saveError = false,
  onRetrySave,
  actions,
  onReview,
}: GameResultScreenProps) {
  const { reducedMotion } = useSettings();
  const sfx = useGameSfx();
  const copy = COPY[result];

  const animateCount = open && !reducedMotion;
  const ratingValue = useCountUp(rating?.before ?? 0, rating?.after ?? 0, animateCount);

  const cardScale = useSharedValue(reducedMotion ? 1 : 0.9);
  const cardOpacity = useSharedValue(0);
  const emojiScale = useSharedValue(reducedMotion ? 1 : 0.5);

  // Fire the chime/haptic + entrance animation once per open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      if (result !== 'aborted') sfx.play(result);
      cardOpacity.value = withTiming(1, { duration: 180 });
      if (reducedMotion) {
        cardScale.value = 1;
        emojiScale.value = 1;
      } else {
        cardScale.value = withSpring(1, { damping: 14, stiffness: 160 });
        emojiScale.value = withSequence(
          withTiming(1.25, { duration: 180 }),
          withSpring(1, { damping: 8 }),
        );
      }
    } else if (!open) {
      wasOpen.current = false;
      cardOpacity.value = 0;
      cardScale.value = reducedMotion ? 1 : 0.9;
      emojiScale.value = reducedMotion ? 1 : 0.5;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: emojiScale.value }] }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: 'rgba(0,0,0,0.65)',
        }}
      >
        <Animated.View
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={[
            {
              width: '100%',
              maxWidth: 360,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 28,
              alignItems: 'center',
            },
            cardStyle,
          ]}
        >
          <Animated.Text style={[{ fontSize: 60, marginBottom: 8 }, emojiStyle]}>
            {copy.emoji}
          </Animated.Text>

          <Text style={{ color: copy.accentHeading ? COLORS.accentHover : COLORS.fg, fontSize: 28, fontWeight: '800', marginBottom: 2 }}>
            {title ?? copy.heading}
          </Text>
          {subtitle && (
            <Text style={{ color: COLORS.fgMuted, fontSize: 15, marginBottom: 4, textAlign: 'center' }}>
              {subtitle}
            </Text>
          )}

          {rating && (
            <View
              style={{
                marginTop: 18,
                marginBottom: 6,
                borderRadius: 14,
                backgroundColor: COLORS.surfaceMuted,
                paddingHorizontal: 20,
                paddingVertical: 14,
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginBottom: 2 }}>Rating</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ color: COLORS.fg, fontSize: 24, fontWeight: '800' }}>{ratingValue}</Text>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '800',
                    color: rating.delta >= 0 ? COLORS.successHover : COLORS.dangerHover,
                  }}
                >
                  {rating.delta >= 0 ? '+' : ''}
                  {rating.delta}
                </Text>
              </View>
              {hintsUsed > 0 && (
                <Text style={{ color: COLORS.warningHover, fontSize: 12, marginTop: 6 }}>
                  Includes −{hintsUsed * HINT_PENALTY} for {hintsUsed}{' '}
                  {hintsUsed === 1 ? 'hint' : 'hints'}
                </Text>
              )}
            </View>
          )}

          {saveError && (
            <View
              accessibilityLiveRegion="polite"
              style={{
                marginTop: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.danger,
                backgroundColor: COLORS.dangerMuted,
                paddingHorizontal: 16,
                paddingVertical: 12,
                alignSelf: 'stretch',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.dangerHover, fontSize: 13, flex: 1, lineHeight: 18 }}>
                Couldn&apos;t save your game — check your connection.
              </Text>
              {onRetrySave && (
                <Pressable
                  onPress={onRetrySave}
                  accessibilityRole="button"
                  accessibilityLabel="Retry saving the game"
                  hitSlop={8}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: COLORS.danger,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={{ marginTop: 22, gap: 10, alignSelf: 'stretch' }}>
            {onReview && (
              <Pressable
                onPress={onReview}
                accessibilityRole="button"
                accessibilityLabel="Review this game"
              >
                {({ pressed }) => (
                  <View
                    style={{
                      minHeight: 48,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.borderStrong,
                      backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>📈</Text>
                    <Text style={{ color: COLORS.fg, fontSize: 16, fontWeight: '700' }}>
                      Review Game
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
            {actions}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
