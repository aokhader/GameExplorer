/**
 * Reanimated helpers over `MOTION` from `@gameexplorer/ui` — the only way mobile
 * code should name a duration, a curve or a spring.
 *
 * Which token an interaction gets is decided in
 * `project-docs/design/motion-spec.md`. These helpers exist so the call site
 * cannot get the mechanics wrong, and there are two ways it used to:
 *
 * - **A partial spring config.** Reanimated 4 defaults to stiffness 900, damping
 *   120 and mass 4, and fills in whatever a config leaves out. The result screen's
 *   `withSpring(1, { damping: 8 })` therefore rang at a damping ratio of 0.07.
 *   `springTo` takes a token name, never an object.
 * - **No easing at all.** `withTiming` without one gets a symmetric `inOut(quad)`,
 *   which is how mobile's board travel quietly stopped matching web's.
 *
 * `timeTo` and `springTo` take the composed `reducedMotion` from the settings
 * provider (the in-app toggle OR the OS switch) and return the plain target when
 * it is set. Reanimated's own reduced-motion handling only reads the OS switch,
 * so relying on it alone would ignore the in-app toggle.
 *
 * Call these from the JS thread — effects and gesture callbacks, which in this
 * app run on JS by explicit configuration — not from inside a worklet.
 *
 * Lint bans a literal `duration`, `damping`, `stiffness` or `mass` inside
 * `withTiming`/`withSpring`, and a bare one-argument call, in mobile source.
 */
import { Easing, withSpring, withTiming, type WithTimingConfig } from 'react-native-reanimated';
import { MOTION } from '@gameexplorer/ui';

export type DurationToken = keyof typeof MOTION.DURATION;
export type EasingToken = keyof typeof MOTION.EASING;
export type SpringToken = keyof typeof MOTION.SPRING;

/** A token curve as a Reanimated easing. */
export function easing(name: EasingToken) {
  const [x1, y1, x2, y2] = MOTION.EASING[name];
  return Easing.bezier(x1, y1, x2, y2);
}

/** A `withTiming` config from tokens, for sequences that need the raw config. */
export function timing(duration: DurationToken, curve: EasingToken = 'standard'): WithTimingConfig {
  return { duration: MOTION.DURATION[duration], easing: easing(curve) };
}

/** Animate to `toValue` on a timed curve, or jump there under reduced motion. */
export function timeTo(
  toValue: number,
  duration: DurationToken,
  curve: EasingToken,
  reducedMotion: boolean,
): number {
  return reducedMotion ? toValue : withTiming(toValue, timing(duration, curve));
}

/** Animate to `toValue` on a token spring, or jump there under reduced motion. */
export function springTo(toValue: number, name: SpringToken, reducedMotion: boolean): number {
  return reducedMotion ? toValue : withSpring(toValue, MOTION.SPRING[name]);
}

/**
 * Repeat count for a pulse that should stop after `limitMs` — never infinite.
 *
 * An infinite `withRepeat` keeps Android from ever reaching idle, which blocks
 * accessibility services and instrumentation and is invisible to every gate.
 * The count is even so a reversing pulse finishes back on its starting value.
 */
export function finitePulseCount(legMs: number, limitMs = 60_000): number {
  return Math.max(2, Math.ceil(limitMs / legMs / 2) * 2);
}
