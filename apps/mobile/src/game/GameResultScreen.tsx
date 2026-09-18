import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { HINT_PENALTY } from '@/engine/trainingRules';
import { Confetti } from './Confetti';
import { ResultDismissContext, type DismissThen } from './resultDismiss';
import { SaveProgressPrompt } from './SaveProgressPrompt';
import { FONTS } from '@/theme/typography';
import { springTo, timing } from '@/theme/motion';
import { Icon, type IconName } from '@/components/ui/Icon';
import { markFinished } from '@/lib/lastPlayed';

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
  /** The first action — Rematch on the game screens. Rendered above Review. */
  actions: React.ReactNode;
  /**
   * The quiet actions, after Review: Change setup, Back to Home. Optional, so a
   * card with a single way out can pass it all through `actions`.
   */
  secondaryActions?: React.ReactNode;
  /**
   * Open game review. Rendered straight after the first action, in the same
   * order web uses: Rematch is what most players do next, and Review is the
   * next most likely — right after a loss is when a player most wants it.
   */
  onReview?: () => void;
}

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const COPY: Record<GameResult, { icon: IconName; heading: string; accentHeading?: true }> = {
  win: { icon: 'trophy', heading: 'You Won!', accentHeading: true },
  loss: { icon: 'hand-fist', heading: 'Good Game' },
  draw: { icon: 'handshake', heading: 'Draw' },
  aborted: { icon: 'x-circle', heading: 'Game Aborted' },
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
 * card over a dim backdrop, an emoji pop, confetti on a win, an optional rating
 * count-up, a terminal chime/haptic, and the one-time guest sign-up ask.
 *
 * Confetti is Reanimated rather than web's canvas-confetti (no RN drop-in), and
 * is suppressed entirely under `reducedMotion`.
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
  secondaryActions,
  onReview,
}: GameResultScreenProps) {
  const { reducedMotion } = useSettings();
  const sfx = useGameSfx();
  const copy = COPY[result];

  /**
   * Leaving the screen happens in two steps: hide the Modal, then act on a
   * later frame.
   *
   * `open` is derived from game state, so it stays true while an action tears
   * the screen down — and navigating out from under a *visible* Modal makes
   * Fabric try to reparent a view the modal host still owns. That surfaces as
   * `addViewAt: … View already has a parent`, usually on the next tab press
   * seconds later rather than on the navigation itself.
   *
   * Hiding first is what avoids it: RN's Modal renders `null` when hidden, so
   * the whole card unmounts in that commit, and the rAF lets Fabric flush the
   * resulting delete instructions before the next screen mounts.
   */
  const [closing, setClosing] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const visible = open && !closing;

  const dismissThen = useCallback<DismissThen>((action) => {
    pendingAction.current = action;
    setClosing(true);
  }, []);

  useEffect(() => {
    const action = pendingAction.current;
    if (!closing || !action) return;
    pendingAction.current = null;

    // Two frames rather than one: the first ends the commit that hid the Modal,
    // the second gives Fabric a frame to mount the resulting deletions before
    // the next screen asks for the same views. (`InteractionManager` would read
    // better here, but RN has deprecated it.)
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(action);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [closing]);

  // Re-arm for the next game — a dismissal that only closed the card (Review,
  // say) must not leave it hidden for good.
  useEffect(() => {
    if (!open) {
      setClosing(false);
      pendingAction.current = null;
    }
  }, [open]);

  const animateCount = visible && !reducedMotion;
  const ratingValue = useCountUp(rating?.before ?? 0, rating?.after ?? 0, animateCount);

  const cardScale = useSharedValue(reducedMotion ? 1 : 0.92);
  const cardOpacity = useSharedValue(0);
  const emojiScale = useSharedValue(reducedMotion ? 1 : 0.4);

  // Fire the chime/haptic + entrance animation once per open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible && !wasOpen.current) {
      wasOpen.current = true;
      // Every local game on every board ends here, so this is where the launcher
      // learns the device has finished one.
      if (result !== 'aborted') markFinished();
      if (result !== 'aborted') sfx.play(result);
      cardOpacity.value = withTiming(1, timing('moderate', 'out'));
      if (reducedMotion) {
        cardScale.value = 1;
        emojiScale.value = 1;
      } else {
        // Token springs with all three physical values. The partial configs
        // these replaced inherited Reanimated 4's mass-4 defaults, so the card
        // wobbled slowly (damping ratio 0.28) and the emoji rang at 0.07. The
        // bouncy spring's own overshoot now does what the 1.25 keyframe faked.
        cardScale.value = springTo(1, 'soft', false);
        emojiScale.value = springTo(1, 'bouncy', false);
      }
    } else if (!visible) {
      wasOpen.current = false;
      cardOpacity.value = 0;
      cardScale.value = reducedMotion ? 1 : 0.92;
      emojiScale.value = reducedMotion ? 1 : 0.4;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, result, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: emojiScale.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: 'rgba(0,0,0,0.65)',
        }}
      >
        {/* Behind the card so pieces fall past it rather than over the text. */}
        <Confetti active={visible && result === 'win'} reducedMotion={reducedMotion} />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={[
            {
              width: '100%',
              maxWidth: 360,
              borderRadius: RADIUS['3xl'],
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 28,
              alignItems: 'center',
            },
            cardStyle,
          ]}
        >
          <Animated.View style={[{ marginBottom: 8 }, emojiStyle]}>
            <Icon
              name={copy.icon}
              size={FONT_SIZES['6xl']}
              color={copy.accentHeading ? COLORS.accentHover : COLORS.fgMuted}
            />
          </Animated.View>

          <Text style={{ color: copy.accentHeading ? COLORS.accentHover : COLORS.fg, fontSize: FONT_SIZES.display, fontFamily: FONTS.display, marginBottom: 2 }}>
            {title ?? copy.heading}
          </Text>
          {subtitle && (
            <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.body, marginBottom: 4, textAlign: 'center' }}>
              {subtitle}
            </Text>
          )}

          {rating && (
            <View
              style={{
                marginTop: 18,
                marginBottom: 6,
                borderRadius: RADIUS['2xl'],
                backgroundColor: COLORS.surfaceMuted,
                paddingHorizontal: 20,
                paddingVertical: 14,
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginBottom: 2 }}>Rating</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACING[2] }}>
                <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES['2xl'], fontFamily: FONTS.display }}>{ratingValue}</Text>
                <Text
                  style={{
                    fontSize: FONT_SIZES.lg,
                    fontFamily: FONTS.display,
                    color: rating.delta >= 0 ? COLORS.successHover : COLORS.dangerHover,
                  }}
                >
                  {rating.delta >= 0 ? '+' : ''}
                  {rating.delta}
                </Text>
              </View>
              {hintsUsed > 0 && (
                <Text style={{ color: COLORS.warningHover, fontSize: FONT_SIZES.xs, marginTop: 6 }}>
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
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor: COLORS.danger,
                backgroundColor: COLORS.dangerMuted,
                paddingHorizontal: 16,
                paddingVertical: 12,
                alignSelf: 'stretch',
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACING['2.5'],
              }}
            >
              <Text style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.label, flex: 1, lineHeight: 18 }}>
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
                    borderRadius: RADIUS.lg,
                    backgroundColor: COLORS.danger,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: FONT_SIZES.label, fontFamily: FONTS.bodyBold }}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Actions that leave the card behind — `BackToHomeButton` navigates;
              Review and Change setup swap the screen's whole tree — go through
              the dismiss-first hop rather than acting on the spot. Rematch
              needs no hop: the board stays mounted and the card closes because
              the game state it reads was reset. */}
          <ResultDismissContext.Provider value={dismissThen}>
            <View style={{ marginTop: 22, gap: SPACING['2.5'], alignSelf: 'stretch' }}>
              {actions}
              {onReview && (
                <Pressable
                  onPress={() => dismissThen(onReview)}
                  accessibilityRole="button"
                  accessibilityLabel="Review this game"
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        minHeight: 48,
                        borderRadius: RADIUS.xl,
                        borderWidth: 1,
                        borderColor: COLORS.borderStrong,
                        backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: SPACING[2],
                      }}
                    >
                      <Icon name="chart-line-up" size={FONT_SIZES.lg} color={COLORS.fg} />
                      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.base, fontFamily: FONTS.bodyBold }}>
                        Review Game
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              {secondaryActions}
            </View>
          </ResultDismissContext.Provider>

          {/* Guests only, once, after their first tour game — renders nothing
              otherwise. Below the actions so it never delays Play Again. */}
          <SaveProgressPrompt open={visible} />
        </Animated.View>
      </View>
    </Modal>
  );
}
