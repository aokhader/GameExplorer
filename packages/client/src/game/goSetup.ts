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

import type { GoGameState, GoMove, GoScoring } from '@gameexplorer/shared';

/**
 * Bot tiers offered on the setup screens, matching the engine's ELO bands.
 *
 * Ordered weakest first: each platform's `DifficultyMeter` draws a tier's rank
 * from its position here, so the order is the ladder.
 */
export const GO_DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Plays nearly at random' },
  { elo: 800, label: 'Casual', description: 'Takes what it can, misses shape' },
  { elo: 1100, label: 'Club', description: 'Reads captures and simple life' },
  { elo: 1400, label: 'Strong', description: 'Fights for territory and eyes' },
  { elo: 1700, label: 'Expert', description: 'Consistent whole-board judgement' },
  { elo: 2000, label: 'Master', description: 'The engine at full strength' },
] as const;

/** Range the rating-matched training bot is clamped into — the calibrated span. */
export const GO_TRAINING_ELO_BOUNDS = { min: 400, max: 2000 };

/**
 * Board sizes on offer.
 *
 * 9×9 is the whole game in miniature and the size this app was built around;
 * 13×13 is where shape and direction start to matter; 19×19 is the real thing.
 * The engine has always been size-generic — what these needed was a bot that
 * could say anything useful about a board with 361 points on it, and a star-point
 * pattern for each.
 *
 * The descriptions say how long a game takes rather than how "hard" the size is,
 * because that is the thing a player is actually choosing between.
 */
export const GO_BOARD_SIZES = [
  { value: 9, label: '9×9', description: 'Ten minutes, and every move matters. The rated size.' },
  { value: 13, label: '13×13', description: 'Room to make shape without a whole evening. Casual only.' },
  { value: 19, label: '19×19', description: 'The full board. Long games, and the bot is weakest here.' },
] as const;

/** The board size a rated game must be played on. */
export const GO_RATED_SIZE = 9;

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

/**
 * Whether a game with these settings counts towards a rating, and if not, the
 * one line the setup screen shows to explain it.
 *
 * **One function, read by both platforms.** The rule used to be an inline
 * `komi !== GO_RATED_KOMI` in each setup screen, which was fine while komi was
 * the only thing that could make a game casual and became a place for the two
 * screens to disagree the moment board size joined it.
 *
 * The rule itself is about *what the ladder was measured on*. The bot's tiers
 * were calibrated at 9×9 with 7.5 komi; komi is worth about seven points on that
 * board, and the search is genuinely weaker on a bigger one because a playout
 * costs what the board costs. A rating earned outside those settings would not
 * mean what a Go rating is supposed to mean.
 */
export function goRatedEligibility(options: {
  size: number;
  komi: number;
}): { rated: boolean; reason?: string } {
  const { size, komi } = options;

  if (size !== GO_RATED_SIZE) {
    return {
      rated: false,
      reason: `Only ${GO_RATED_SIZE}×${GO_RATED_SIZE} games are rated — the bot’s tiers were measured there, and it is weaker on a bigger board.`,
    };
  }
  if (komi !== GO_RATED_KOMI) {
    return {
      rated: false,
      reason: `Games away from ${GO_RATED_KOMI} komi are casual — komi is worth about seven points here, and the bot’s tiers were measured at ${GO_RATED_KOMI}.`,
    };
  }
  return { rated: true };
}

/** The one-line ruleset summary both setup screens show under the title. */
export function goRulesetSummary(size: number, komi: number, scoring: GoScoring): string {
  const rules = scoring === 'area' ? 'area scoring' : 'territory scoring';
  return komi === 0
    ? `${size}×${size} · ${rules} · no komi`
    : `${size}×${size} · ${rules} · ${komi} komi to white`;
}

/** One row of a Go move list: a move, and the position it produced. */
export interface GoHistoryRow {
  /** Index into the timeline — what a history scrubber's `setViewIndex` takes. */
  index: number;
  move: GoMove;
}

/**
 * The move list, derived from the timeline rather than from the move history.
 *
 * Every other game here can assume `timeline[i + 1]` is the position after move
 * `i`, and Go cannot. Leaving the dead-stone review — `resumePlay`, the dispute
 * path — appends a position that is **not a move**, and from that point on the
 * assumption is off by one for the rest of the game: clicking a move shows the
 * position before it, and the move just played never highlights. Finalizing
 * does the same thing at the end of the game.
 *
 * Walking the timeline and emitting a row wherever the history grew cannot
 * drift, whatever a future phase transition decides to append.
 */
export function goTimelineRows(timeline: readonly GoGameState[]): GoHistoryRow[] {
  const rows: GoHistoryRow[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const history = timeline[i].moveHistory;
    if (history.length > timeline[i - 1].moveHistory.length) {
      rows.push({ index: i, move: history[history.length - 1] });
    }
  }
  return rows;
}

/** Which row the board is showing, or −1 while it shows a position no move produced. */
export function goActiveRow(rows: readonly GoHistoryRow[], viewIndex: number): number {
  return rows.findIndex((row) => row.index === viewIndex);
}
