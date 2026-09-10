/**
 * `constants/` holds data that survives a JSON round trip.
 *
 * The contract is stated in the modules themselves —
 * `constants/puzzles/index.ts` puts it as *"Every field must survive
 * `JSON.parse(JSON.stringify(x))` unchanged — this is the shape a `puzzles`
 * table row will deserialize into"*, and `constants/tutorials/types.ts` as
 * *"no JSX, no functions"* — because these modules cross a Next.js RSC
 * boundary, are parsed raw by Metro on every cold boot, and are the shape a
 * database row deserializes into. Until now the rule was enforced only by
 * everyone remembering it, which was survivable while every file here was
 * hand-written and stops being survivable once a script generates them.
 *
 * **The check is on the exported values, not on the source text.** An earlier
 * draft grepped for `function` and `=>` and flagged four files that are all
 * fine: `games.ts` and `endReasons.ts` deliberately export small helpers, and
 * `tutorials/{chess,checkers}.ts` build their piece lists with a module-scope
 * `.map(...)` whose *result* is still plain data. A syntactic proxy would have
 * forced two real modules to move and two authoring conveniences to be typed
 * out by hand, to catch nothing the round trip does not catch properly.
 *
 * So: every non-function export must round-trip, everywhere; and the subtrees
 * that promise data *only* must additionally export no functions at all.
 */

import { describe, expect, it } from 'vitest';

/** Modules that may export helpers alongside their data. */
const MIXED_MODULES: Record<string, () => Promise<Record<string, unknown>>> = {
  'games.ts': () => import('./games'),
  'endReasons.ts': () => import('./endReasons'),
  'onboarding.ts': () => import('./onboarding'),
};

/**
 * Subtrees that promise data only. These are the ones a database row or a
 * generated file lands in, and the ones Metro parses on every cold boot.
 */
const DATA_ONLY_MODULES: Record<string, () => Promise<Record<string, unknown>>> = {
  'botTiers.ts': () => import('./botTiers'),
  'puzzles/index.ts': () => import('./puzzles'),
  'lessons/index.ts': () => import('./lessons'),
  'tutorials/index.ts': () => import('./tutorials'),
};

const ALL = { ...MIXED_MODULES, ...DATA_ONLY_MODULES };

describe('constants/ exports survive a JSON round trip', () => {
  it.each(Object.keys(ALL))('%s', async (name) => {
    const mod = await ALL[name]();
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value === 'function') continue; // covered by the next block
      try {
        expect(JSON.parse(JSON.stringify(value))).toEqual(value);
      } catch {
        offenders.push(key);
      }
    }
    expect(
      offenders,
      `${name}: ${offenders.join(', ')} did not survive JSON.parse(JSON.stringify(x)). ` +
        'These modules are the shape a database row deserializes into.',
    ).toEqual([]);
  });
});

describe('data-only constants export no behaviour', () => {
  it.each(Object.keys(DATA_ONLY_MODULES))('%s exports no function', async (name) => {
    const mod = await DATA_ONLY_MODULES[name]();
    const fns = Object.entries(mod)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    expect(
      fns,
      `${name} exports ${fns.join(', ')}. This subtree is data only — move behaviour to a ` +
        'sibling module (puzzles/, lessons/) that may export functions.',
    ).toEqual([]);
  });
});

describe('the guard is actually guarding something', () => {
  it('covers every module it names', async () => {
    // A resolution or naming slip would make every assertion above vacuously
    // true, which is the one way this file could fail silently.
    for (const load of Object.values(ALL)) {
      const mod = await load();
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
  });

  it('would reject a function smuggled into a data-only module', () => {
    const pretend = { PUZZLES: [], helper: () => 1 };
    const fns = Object.entries(pretend).filter(([, v]) => typeof v === 'function');
    expect(fns).toHaveLength(1);
  });
});
