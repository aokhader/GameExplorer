/**
 * Framer Motion presets for GameExplorer (web), built on `MOTION` from
 * `@gameexplorer/ui`.
 *
 * Nothing here owns a number. Durations, curves and springs come from the shared
 * tokens, which mobile's Reanimated helpers read too, so a spring on the result
 * screen settles the same way on both platforms. What belongs to an interaction
 * — which token a press, an entrance or a celebration gets — is decided in
 * `project-docs/design/motion-spec.md`, not here.
 *
 * Accessibility: continuous/ambient motion lives in CSS gated behind
 * prefers-reduced-motion. For Framer-driven entrances, read the composed
 * `reducedMotion` from the settings provider (the in-app toggle OR the OS
 * preference) and fall back to `fadeOnly`.
 */
import type { Transition, Variants } from 'framer-motion';
import { MOTION } from '@gameexplorer/ui';

const { DURATION, EASING, SPRING_FRAMER, STAGGER } = MOTION;

/** Framer Motion takes seconds; the tokens are milliseconds. */
export const seconds = (ms: number): number => ms / 1000;

// ── Spring + tween presets ───────────────────────────────────────────────────

/** Settled spring — panels, cards, sheets, layout shifts. */
export const springSoft: Transition = SPRING_FRAMER.soft;

/** A hint of overshoot — press release, toggles, chips. */
export const springSnappy: Transition = SPRING_FRAMER.snappy;

/** Visible overshoot — celebration only (trophy, badges). */
export const springBouncy: Transition = SPRING_FRAMER.bouncy;

/** Entrances: a screen, a dialog, a card arriving. */
export const easeOut: Transition = {
  duration: seconds(DURATION.moderate),
  ease: EASING.out,
};

/** Exits: one step faster than the entrance, accelerating away. */
export const easeIn: Transition = {
  duration: seconds(DURATION.fast),
  ease: EASING.in,
};

// ── Reusable variants ────────────────────────────────────────────────────────

/** Pop in from slightly small + low, with a snappy spring. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.9, transition: easeIn },
};

/** Rise + fade — list items, sections entering. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

/**
 * Container that staggers its children's entrances `MOTION.STAGGER.step` apart,
 * per the spec's list rule. The `maxItems` cap is the caller's to apply, since
 * only the caller knows the list.
 */
export const staggerChildren: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: seconds(STAGGER.step) },
  },
};

/** Page-level cross-fade with a small lift. */
export const pageFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, transition: easeIn },
};

/** Celebratory trophy/crown entrance — overshoots then settles. */
export const celebratePop: Variants = {
  hidden: { opacity: 0, scale: 0.4, rotate: -12 },
  show: { opacity: 1, scale: 1, rotate: 0, transition: springBouncy },
};

/**
 * Reduced-motion fallback: no movement, an instant opacity change. Swap any of
 * the above for this when `reducedMotion` is set.
 */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.instant } },
  exit: { opacity: 0, transition: { duration: DURATION.instant } },
};

/**
 * Whether motion is reduced right now: the OS preference, or Settings' toggle
 * as mirrored onto `<html data-reduced-motion>`.
 *
 * For code outside render that has to decide whether to wait for an animation —
 * `Modal` holding itself open for its exit — where the settings context is not
 * the natural read. Inside a component, prefer `useSettings().reducedMotion`.
 * On the server it answers false.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.hasAttribute('data-reduced-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
