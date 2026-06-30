/**
 * Shared motion language for GameExplorer (web).
 *
 * Single source for Framer Motion springs + variants so motion reads as one
 * choreographed system, not ad-hoc per-component tweaks. Keep durations short
 * and springs lively — this is a games app, motion should feel playful, not
 * sluggish.
 *
 * Accessibility: continuous/ambient motion lives in CSS gated behind
 * prefers-reduced-motion. For Framer-driven entrances, pair these with the
 * `useReducedMotion()` hook (or the app's reduce-motion setting) and fall back
 * to opacity-only / instant transitions when motion is suppressed.
 */
import type { Transition, Variants } from 'framer-motion';

// ── Spring + tween presets ───────────────────────────────────────────────────

/** Gentle, settled spring — panels, cards, layout shifts. */
export const springSoft: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
  mass: 0.9,
};

/** Quick, snappy spring with a touch of overshoot — buttons, chips, pops. */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 24,
  mass: 0.7,
};

/** Bouncy spring with visible overshoot — celebratory pops (trophy, badges). */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 12,
  mass: 0.8,
};

/** Smooth ease for cross-fades and page transitions. */
export const easeOut: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

// ── Reusable variants ────────────────────────────────────────────────────────

/** Pop in from slightly small + low, with a snappy spring. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.9, transition: easeOut },
};

/** Rise + fade — list items, sections entering. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springSoft },
};

/** Container that staggers its children's entrances. */
export const staggerChildren: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

/** Page-level cross-fade with a small lift. */
export const pageFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

/** Celebratory trophy/crown entrance — overshoots then settles. */
export const celebratePop: Variants = {
  hidden: { opacity: 0, scale: 0.4, rotate: -12 },
  show: { opacity: 1, scale: 1, rotate: 0, transition: springBouncy },
};

/**
 * Reduced-motion fallbacks. When the user prefers reduced motion (or toggles
 * it in Settings), swap any of the above for an opacity-only instant variant.
 */
export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
};
