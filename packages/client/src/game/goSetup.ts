/**
 * Everything a Go setup screen needs to offer, and nothing that can play a game.
 *
 * Split out of `goAdapter.ts` for one concrete reason: the adapter imports the
 * game writer, and `@gameexplorer/db` builds a Supabase client the moment it is
 * loaded. A card that renders five komi buttons should not drag a database
 * client into the bundle — or into a component test, which is where this first
 * bit.
 *
 * Pure data and pure functions. Both platforms read these rather than keeping
 * their own copies, which is what stops the two setup screens drifting into
 * offering different rulesets.
 */

import type { GoScoring } from '@gameexplorer/shared';

/** Bot tiers offered on the setup screens, matching the engine's ELO bands. */
export const GO_DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Plays nearly at random', icon: '🟢' },
  { elo: 800, label: 'Casual', description: 'Takes what it can, misses shape', icon: '🔵' },
  { elo: 1100, label: 'Club', description: 'Reads captures and simple life', icon: '🟡' },
  { elo: 1400, label: 'Strong', description: 'Fights for territory and eyes', icon: '🟠' },
  { elo: 1700, label: 'Expert', description: 'Consistent whole-board judgement', icon: '🔴' },
  { elo: 2000, label: 'Master', description: 'The engine at full strength', icon: '⚫' },
] as const;

/** Range the rating-matched training bot is clamped into — the calibrated span. */
export const GO_TRAINING_ELO_BOUNDS = { min: 400, max: 2000 };

/**
 * The komi a rated game must be played at.
 *
 * Komi is worth roughly seven points on a 9×9 board, so choosing it is choosing
 * how big a head start you get. The bot's ELO ladder was calibrated at 7.5, and
 * a player who took Black at komi 0 would beat a tier they cannot actually beat.
 * The setup screens offer every preset and turn the rated toggle off elsewhere.
 */
export const GO_RATED_KOMI = 7.5;

/**
 * Komi presets. The two integers can end a game level, which is real Go (jigo)
 * and is why a scored Go position is allowed to have no winner.
 */
export const GO_KOMI_PRESETS = [
  { value: 0, label: 'None', description: 'No compensation. Black keeps the whole first-move edge.' },
  { value: 0.5, label: '0.5', description: 'Just enough to break a tie in White’s favour.' },
  { value: 5.5, label: '5.5', description: 'The old standard. A little kinder to Black.' },
  { value: 6.5, label: '6.5', description: 'The usual komi on a full-size board.' },
  { value: 7.5, label: '7.5', description: 'Standard for 9×9, and the only rated setting.' },
] as const;

/** Scoring rules, with the one line each that a player actually needs. */
export const GO_SCORING_OPTIONS: readonly {
  value: GoScoring;
  label: string;
  description: string;
}[] = [
  {
    value: 'area',
    label: 'Area',
    description: 'Your stones plus the empty points you surround. Filling a neutral point is free.',
  },
  {
    value: 'territory',
    label: 'Territory',
    description:
      'Only the empty points you surround, plus the stones you captured. The Japanese count.',
  },
];

export function goEloLabel(elo: number): string {
  return GO_DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

/** How a komi reads in a sentence — `7.5 komi`, or `no komi` at zero. */
export function goKomiLabel(komi: number): string {
  return komi === 0 ? 'no komi' : `${komi} komi`;
}

/** The one-line ruleset summary both setup screens show under the title. */
export function goRulesetSummary(size: number, komi: number, scoring: GoScoring): string {
  const rules = scoring === 'area' ? 'area scoring' : 'territory scoring';
  return komi === 0
    ? `${size}×${size} · ${rules} · no komi`
    : `${size}×${size} · ${rules} · ${komi} komi to white`;
}
