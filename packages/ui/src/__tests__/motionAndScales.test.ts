/**
 * Invariants for `MOTION` and the three layout scales, and for their mirrors.
 *
 * The motion spec (`project-docs/design/motion-spec.md`) is only worth having if
 * the numbers cannot quietly wander from it. Three ways they could, each pinned
 * below:
 *
 * - **The two spring shapes disagree.** Web reads `SPRING_FRAMER`, mobile reads
 *   `SPRING`; one number edited in one of them and the result screen settles
 *   differently per platform.
 * - **`DURATION.base` and `BOARD_ANIM_MS` drift.** They are the same tempo, but
 *   `packages/shared` cannot import this package, so the equality has to be read
 *   off the source text rather than imported.
 * - **The CSS mirror drifts.** `apps/web/src/app/globals.css` restates the new
 *   type steps, the curves and the durations as custom properties, and nothing
 *   at build time checks a CSS value against a TypeScript one. This test does.
 *   Reading another workspace's file is not an import, so `packages/ui` stays a
 *   leaf.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { MOTION, FONT_SIZES, RADIUS, SPACING } from '../tokens';

const REPO = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/** Tailwind v4.2's default theme, for the steps the scales share with it by name. */
const TAILWIND_TEXT: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60,
};
const TAILWIND_RADIUS: Record<string, number> = {
  xs: 2, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, '4xl': 32,
};

describe('MOTION', () => {
  it('climbs a strictly ascending duration ladder from zero', () => {
    const values = Object.values(MOTION.DURATION);
    expect(values[0]).toBe(0);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('keeps DURATION.base equal to the board’s BOARD_ANIM_MS', () => {
    const source = read('packages/shared/src/board/transition.ts');
    const match = /export const BOARD_ANIM_MS = (\d+);/.exec(source);
    expect(match, 'BOARD_ANIM_MS not found — did it move?').not.toBeNull();
    expect(MOTION.DURATION.base).toBe(Number(match![1]));
  });

  it('defines every curve as a valid CSS cubic-bezier, and states it identically as a string', () => {
    for (const [name, [x1, y1, x2, y2]] of Object.entries(MOTION.EASING)) {
      // CSS rejects x control points outside [0, 1]; y may overshoot.
      expect(x1, name).toBeGreaterThanOrEqual(0);
      expect(x1, name).toBeLessThanOrEqual(1);
      expect(x2, name).toBeGreaterThanOrEqual(0);
      expect(x2, name).toBeLessThanOrEqual(1);
      expect(MOTION.EASING_CSS[name as keyof typeof MOTION.EASING]).toBe(
        `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
      );
    }
  });

  it('gives every spring all three physical values, in both shapes', () => {
    for (const [name, spring] of Object.entries(MOTION.SPRING)) {
      expect(Object.keys(spring).sort(), name).toEqual(['damping', 'mass', 'stiffness']);
      for (const v of Object.values(spring)) expect(v, name).toBeGreaterThan(0);
      expect(MOTION.SPRING_FRAMER[name as keyof typeof MOTION.SPRING]).toEqual({ type: 'spring', ...spring });
    }
  });

  it('keeps each spring inside the damping band its name promises', () => {
    const ratio = ({ stiffness, damping, mass }: { stiffness: number; damping: number; mass: number }) =>
      damping / (2 * Math.sqrt(stiffness * mass));
    // soft: no visible overshoot. snappy: a hint. bouncy: celebration.
    expect(ratio(MOTION.SPRING.soft)).toBeGreaterThanOrEqual(0.85);
    expect(ratio(MOTION.SPRING.snappy)).toBeGreaterThanOrEqual(0.5);
    expect(ratio(MOTION.SPRING.snappy)).toBeLessThan(0.8);
    expect(ratio(MOTION.SPRING.bouncy)).toBeLessThan(0.5);
  });

  it('staggers a list faster than a press, and caps it inside one entrance', () => {
    expect(MOTION.STAGGER.step).toBeLessThan(MOTION.DURATION.micro);
    // The last staggered item starts before the first has finished arriving, so
    // the list reads as one movement rather than a queue.
    expect(MOTION.STAGGER.step * (MOTION.STAGGER.maxItems - 1)).toBeLessThan(MOTION.DURATION.moderate);
  });
});

describe('layout scales', () => {
  it('orders the type and radius scales ascending', () => {
    for (const scale of [FONT_SIZES, RADIUS]) {
      const values = Object.values(scale);
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('keys spacing by Tailwind’s multiplier, so SPACING[n] is always n × 4px', () => {
    for (const [key, px] of Object.entries(SPACING)) expect(px, key).toBe(Number(key) * 4);
  });

  it('agrees with Tailwind v4 wherever a step shares a Tailwind name', () => {
    for (const [key, px] of Object.entries(TAILWIND_TEXT)) {
      expect(FONT_SIZES[key as keyof typeof FONT_SIZES], `text-${key}`).toBe(px);
    }
    for (const [key, px] of Object.entries(TAILWIND_RADIUS)) {
      expect(RADIUS[key as keyof typeof RADIUS], `rounded-${key}`).toBe(px);
    }
  });
});

describe('the web CSS mirror', () => {
  const css = read('apps/web/src/app/globals.css');
  const cssVar = (name: string) => {
    const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
    return match ? match[1].trim() : undefined;
  };

  it('declares every type step Tailwind lacks, in rem, at the token size', () => {
    for (const [key, px] of Object.entries(FONT_SIZES)) {
      if (key in TAILWIND_TEXT) continue;
      expect(cssVar(`text-${key}`), `--text-${key}`).toBe(`${px / 16}rem`);
    }
  });

  it('declares every curve but linear as --ease-*, which Tailwind already spells', () => {
    for (const [name, value] of Object.entries(MOTION.EASING_CSS)) {
      if (name === 'linear') continue;
      expect(cssVar(`ease-${name}`), `--ease-${name}`).toBe(value);
    }
  });

  it('declares every duration as --duration-*', () => {
    for (const [name, ms] of Object.entries(MOTION.DURATION)) {
      expect(cssVar(`duration-${name}`), `--duration-${name}`).toBe(`${ms}ms`);
    }
  });

  it('pins Tailwind’s default transition to the fast duration and the standard curve', () => {
    expect(cssVar('default-transition-duration')).toBe(`${MOTION.DURATION.fast}ms`);
    expect(cssVar('default-transition-timing-function')).toBe(MOTION.EASING_CSS.standard);
  });
});
