/**
 * First-run tour constants, shared by web's `/welcome` and mobile's
 * `app/welcome.tsx`.
 *
 * The two tours were written independently and drifted: web mapped the chosen
 * "vibe" to a per-game bot ELO and deep-linked into a game at that strength,
 * while mobile collected the same choice and then dropped it on the floor —
 * every tour on mobile started the default bot regardless of what was picked.
 * Keeping the mapping here means a change to one platform's ladder cannot
 * silently leave the other behind.
 */

export type OnboardingGame = 'chess' | 'checkers' | 'reversi';
export type OnboardingDifficulty = 'relaxed' | 'balanced' | 'sharp';

/**
 * Bot strength each vibe maps to, on each game's own ELO scale. The bot setup
 * screens clamp and snap these, so they need to be sensible presets rather than
 * exact values.
 */
export const DIFFICULTY_ELO: Record<OnboardingGame, Record<OnboardingDifficulty, number>> = {
  chess: { relaxed: 600, balanced: 1200, sharp: 2000 },
  checkers: { relaxed: 500, balanced: 1100, sharp: 1700 },
  reversi: { relaxed: 500, balanced: 1100, sharp: 1700 },
};
