import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, MOTION, useThemeName, RADIUS, SPACING } from '@gameexplorer/ui';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';
import { springTo, timeTo } from '@/theme/motion';

export interface SheetProps {
  open: boolean;
  /**
   * Must set `open` false. When the sheet dismisses itself it slides away first
   * and calls this once the slide has finished.
   */
  onClose: () => void;
  /** Screen-reader label on the dismissing scrim. */
  closeLabel?: string;
  /** Hide the grabber, and with it the drag — a sheet that cannot be dragged should not imply it can. */
  grabber?: boolean;
  /** Sheet surface. Defaults to the app's raised surface. */
  backgroundColor?: string;
  /** Top corner radius. */
  radius?: number;
  /** Cap the height as a fraction of the window, for long lists. */
  maxHeightRatio?: number;
  children: ReactNode;
}

/** When a released drag dismisses the sheet — `motion-spec.md` §5.9. */
export const SHEET_DISMISS = {
  /** Past this fraction of the sheet's height. */
  distanceRatio: 0.3,
  /** Or flung downward faster than this, in points per second. */
  velocity: 800,
} as const;

/** Whether a drag released at this offset and velocity should dismiss the sheet. */
export function shouldDismissSheet(translationY: number, velocityY: number, sheetHeight: number): boolean {
  if (velocityY > SHEET_DISMISS.velocity) return true;
  // Unmeasured, there is no height to take a fraction of; only a fling counts.
  return sheetHeight > 0 && translationY > sheetHeight * SHEET_DISMISS.distanceRatio;
}

const SCRIM = 'rgba(0,0,0,0.6)';

/**
 * Android draws a Modal in a native window of its own, outside the app root's
 * gesture handler, so the drag needs a root of its own inside it there. iOS
 * presents the Modal within the existing root and needs nothing.
 */
const ModalGestureRoot = Platform.OS === 'android' ? GestureHandlerRootView : View;

/**
 * The app's bottom sheet, moving per `motion-spec.md` §5.9.
 *
 * It rises on the `soft` spring while its scrim fades in over `fast`, follows a
 * downward drag on the grabber, and slides away when it dismisses itself: a
 * scrim tap, the back button, or a drag released past `SHEET_DISMISS`. Under
 * reduced motion it appears and disappears at once, and a drag still follows
 * the finger but snaps on release.
 *
 * **When its owner closes it — `open` set false because a row acted — it
 * vanishes at once.** That is deliberate. An exit animation would keep the Modal
 * on screen while the row's action runs, and those actions navigate, open a
 * second sheet, or raise the system share sheet. Navigating out from under a
 * visible Modal crashes Fabric (see `game/resultDismiss.tsx`), and on iOS
 * dismissing a modal also dismisses whatever was presented over it. A
 * self-dismissal has no action waiting on it, so it can afford to animate.
 *
 * On Android the drag sits under a gesture root of its own — see
 * `ModalGestureRoot`.
 *
 * Tests read the sheet through jest-expo's Modal mock, which renders children
 * twice, so they query the last match (see `GameBar.test.tsx`).
 */
export function Sheet({
  open,
  onClose,
  closeLabel = 'Close',
  grabber = true,
  backgroundColor,
  radius = 20,
  maxHeightRatio = 0.86,
  children,
}: SheetProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { height: windowHeight } = useWindowDimensions();
  const { reducedMotion } = useFeedbackPrefs();

  /** The sheet's downward displacement from its resting place. Starts off-screen. */
  const offset = useSharedValue(windowHeight);
  const scrim = useSharedValue(0);
  const sheetHeight = useRef(0);
  const entered = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Closed by its owner: the Modal is already gone in this commit, so park the
  // sheet off-screen, ready to rise again next time.
  useEffect(() => {
    if (open) return;
    if (leaving.current) {
      clearTimeout(leaving.current);
      leaving.current = null;
    }
    entered.current = false;
    offset.value = windowHeight;
    scrim.value = 0;
  }, [open, windowHeight, offset, scrim]);

  useEffect(
    () => () => {
      if (leaving.current) clearTimeout(leaving.current);
    },
    [],
  );

  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetHeight.current = e.nativeEvent.layout.height;
    // Content that grows while open (a chat message) must not replay the rise.
    if (entered.current || !open) return;
    entered.current = true;
    offset.value = sheetHeight.current;
    offset.value = springTo(0, 'soft', reducedMotion);
    scrim.value = timeTo(1, 'fast', 'standard', reducedMotion);
  };

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    if (reducedMotion) {
      onClose();
      return;
    }
    offset.value = timeTo(sheetHeight.current || windowHeight, 'fast', 'in', false);
    scrim.value = timeTo(0, 'fast', 'standard', false);
    leaving.current = setTimeout(() => {
      leaving.current = null;
      onClose();
    }, MOTION.DURATION.fast);
  }, [reducedMotion, onClose, offset, scrim, windowHeight]);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        // JS-thread callbacks, as every gesture in this app is configured, so
        // the component stays mountable under Jest.
        .runOnJS(true)
        .onUpdate((e) => {
          offset.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (shouldDismissSheet(e.translationY, e.velocityY, sheetHeight.current)) dismiss();
          else offset.value = springTo(0, 'soft', reducedMotion);
        }),
    [dismiss, offset, reducedMotion],
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <ModalGestureRoot style={{ flex: 1 }}>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM }, scrimStyle]}
          />
          <Animated.View style={sheetStyle} onLayout={onSheetLayout}>
            {/* Swallows taps so pressing the sheet itself doesn't dismiss it. */}
            <Pressable onPress={() => {}} accessible={false}>
              <SafeAreaView
                edges={['bottom']}
                style={{ backgroundColor: backgroundColor ?? COLORS.surfaceAlt }}
              >
                <View
                  style={{
                    borderTopLeftRadius: radius,
                    borderTopRightRadius: radius,
                    borderTopWidth: 1,
                    borderColor: COLORS.border,
                    paddingHorizontal: 16,
                    // The grabber's drag strip supplies the top padding when it is shown.
                    paddingTop: grabber ? 0 : 10,
                    paddingBottom: 12,
                    gap: SPACING[1],
                    maxHeight: windowHeight * maxHeightRatio,
                  }}
                >
                  {grabber && (
                    <GestureDetector gesture={drag}>
                      {/* A full-width strip, so the drag target is wider than the 40pt bar it shows. */}
                      <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 10, paddingBottom: 10 }}>
                        <View
                          style={{
                            width: 40,
                            height: 4,
                            borderRadius: RADIUS.full,
                            backgroundColor: COLORS.borderStrong,
                          }}
                        />
                      </View>
                    </GestureDetector>
                  )}
                  {children}
                </View>
              </SafeAreaView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </ModalGestureRoot>
    </Modal>
  );
}
