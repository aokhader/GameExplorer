import { BOT_TIERS, botStrengthLabel, type RatedGameId } from '@gameexplorer/shared';
import {
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_SCORING_OPTIONS,
  goKomiLabel,
  goRatedEligibility,
} from './goSetup';
import type {
  BotGameSetup,
  GoSetup,
  LiquidateSetup,
  SetupFor,
  SetupGame,
  SetupMode,
} from './localSetup';

/**
 * A game's setup, as a list of named choices — the model behind the chips that
 * sit under Start.
 *
 * **Why this exists.** Every screen used to collapse the setup into one
 * sentence (`setupSummary`) with a *Change* button beside it, and the sentence
 * left things out: Go printed its board size only when it was *not* 9×9, so the
 * default — the thing almost everyone was about to play — was the one case that
 * said nothing at all. A player could not see, let alone change, the choice
 * that defines the game without leaving the page first.
 *
 * Each field carries its own options and the patch that applies one, so a
 * surface renders the list without knowing which game it is showing, and a new
 * game's choices appear by being described here once.
 */

export interface SetupFieldOption {
  /** Stable, serialisable; `apply` turns it back into the setup's own type. */
  value: string;
  label: string;
  /** One short line under the option, where it needs explaining. */
  detail?: string;
}

export interface SetupField<G extends SetupGame> {
  key: string;
  /** What the choice is called: "Strength", "You play", "Board". */
  label: string;
  /** The current value, as the chip shows it. */
  value: string;
  /** Which option is selected, by `value`. */
  selected: string;
  options: readonly SetupFieldOption[];
  apply: (value: string) => Partial<SetupFor[G]>;
  /** Present when the choice cannot be made, and why. */
  locked?: string;
}

const BOT_GAMES = new Set(['chess', 'checkers', 'reversi', 'go']);

function strengthField<G extends SetupGame>(game: RatedGameId, setup: BotGameSetup): SetupField<G> {
  const tiers = BOT_TIERS[game];
  const onTier = tiers.some((t) => t.elo === setup.elo);
  return {
    key: 'elo',
    label: 'Strength',
    // A custom rating keeps its number: it is the thing that was chosen.
    value: onTier ? `${botStrengthLabel(game, setup.elo)} · ${setup.elo}` : `${setup.elo}`,
    selected: String(setup.elo),
    options: tiers.map((t) => ({
      value: String(t.elo),
      label: `${t.label} · ${t.elo}`,
    })),
    apply: (value) => ({ elo: Number(value), ...(game === 'chess' ? { custom: false } : {}) }) as unknown as Partial<SetupFor[G]>,
  };
}

function colorField<G extends SetupGame>(game: SetupGame, setup: BotGameSetup, mode: SetupMode): SetupField<G> {
  // Reversi and Go call the sides by their stones; chess and checkers by
  // the pieces. All four store them as white/black.
  const first = game === 'reversi' || game === 'go' ? 'black' : 'white';
  const label = (side: 'white' | 'black') => (side === 'white' ? 'White' : 'Black');
  return {
    key: 'color',
    label: mode === 'pass-and-play' ? 'Bottom seat' : 'You play',
    value: label(setup.color),
    selected: setup.color,
    options: (['white', 'black'] as const).map((side) => ({
      value: side,
      label: label(side),
      detail: side === first ? 'Moves first' : 'Moves second',
    })),
    apply: (value) => ({ color: value as 'white' | 'black' }) as unknown as Partial<SetupFor[G]>,
  };
}

function ratedField<G extends SetupGame>(setup: BotGameSetup, signedIn: boolean, blocked?: string): SetupField<G> {
  return {
    key: 'rated',
    // "Rating: Rated" rather than "Rated: Rated" — the chip prints both halves.
    label: 'Rating',
    value: setup.rated ? 'Rated' : 'Casual',
    selected: setup.rated ? 'on' : 'off',
    options: [
      { value: 'on', label: 'Rated', detail: 'The result moves your rating' },
      { value: 'off', label: 'Casual', detail: 'Nothing is recorded' },
    ],
    apply: (value) => ({ rated: value === 'on' }) as unknown as Partial<SetupFor[G]>,
    locked: !signedIn ? 'Sign in to play rated games' : blocked,
  };
}

function goFields(setup: GoSetup): SetupField<'go'>[] {
  return [
    {
      key: 'size',
      label: 'Board',
      value: `${setup.size}×${setup.size}`,
      selected: String(setup.size),
      options: GO_BOARD_SIZES.map((s) => ({
        value: String(s.value),
        label: s.label,
        detail: s.description,
      })),
      apply: (value) => ({ size: Number(value) }),
    },
    {
      key: 'scoring',
      label: 'Scoring',
      value: GO_SCORING_OPTIONS.find((o) => o.value === setup.scoring)?.label ?? setup.scoring,
      selected: setup.scoring,
      options: GO_SCORING_OPTIONS.map((o) => ({ value: o.value, label: o.label, detail: o.description })),
      apply: (value) => ({ scoring: value as GoSetup['scoring'] }),
    },
    {
      key: 'komi',
      label: 'Komi',
      // The preset's own short label: `goKomiLabel` says "7.5 komi", and the
      // chip has already said "Komi".
      value: GO_KOMI_PRESETS.find((k) => k.value === setup.komi)?.label ?? goKomiLabel(setup.komi),
      selected: String(setup.komi),
      options: GO_KOMI_PRESETS.map((k) => ({ value: String(k.value), label: k.label, detail: k.description })),
      apply: (value) => ({ komi: Number(value) }),
    },
  ];
}

const LIQUIDATE_BOT_COPY: Record<LiquidateSetup['botLevel'], string> = {
  cautious: 'Buys little, holds cash',
  steady: 'Plays the odds',
  shrewd: 'Reads the board',
  ruthless: 'Plays to bankrupt you',
};

function liquidateFields(setup: LiquidateSetup, mode: SetupMode): SetupField<'liquidate'>[] {
  const fields: SetupField<'liquidate'>[] = [
    {
      key: 'players',
      label: 'Players',
      value: `${setup.players}`,
      selected: String(setup.players),
      options: [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}` })),
      apply: (value) => ({ players: Number(value) }),
    },
    {
      key: 'board',
      label: 'Board',
      value: setup.board === 'quick' ? 'Quick' : 'Full',
      selected: setup.board,
      options: [
        { value: 'quick', label: 'Quick', detail: 'About twenty minutes' },
        { value: 'full', label: 'Full', detail: 'The whole board' },
      ],
      apply: (value) => ({ board: value as LiquidateSetup['board'] }),
    },
    {
      key: 'debtRule',
      label: 'Debt',
      value: setup.debtRule === 'allow-negative' ? 'Allowed' : 'Not allowed',
      selected: setup.debtRule,
      options: [
        { value: 'allow-negative', label: 'Allowed', detail: 'You can go below zero' },
        { value: 'never-negative', label: 'Not allowed', detail: 'A move you cannot afford is refused' },
      ],
      apply: (value) => ({ debtRule: value as LiquidateSetup['debtRule'] }),
    },
  ];
  if (mode !== 'pass-and-play') {
    fields.splice(1, 0, {
      key: 'botLevel',
      label: 'Bots',
      value: setup.botLevel.charAt(0).toUpperCase() + setup.botLevel.slice(1),
      selected: setup.botLevel,
      options: (Object.keys(LIQUIDATE_BOT_COPY) as LiquidateSetup['botLevel'][]).map((level) => ({
        value: level,
        label: level.charAt(0).toUpperCase() + level.slice(1),
        detail: LIQUIDATE_BOT_COPY[level],
      })),
      apply: (value) => ({ botLevel: value as LiquidateSetup['botLevel'] }),
    });
  }
  return fields;
}

/**
 * The choices this game and mode offer, in the order they should be shown —
 * the one that changes the game most first.
 *
 * Pass-and-play has no strength and nothing to rate; training picks its own
 * strength from the player's rating and is rated by definition, so neither
 * appears as a choice that could be made and then ignored.
 */
export function setupFields<G extends SetupGame>(
  game: G,
  mode: SetupMode,
  setup: SetupFor[G],
  options: { signedIn: boolean },
): SetupField<G>[] {
  if (game === 'liquidate') {
    return liquidateFields(setup as LiquidateSetup, mode) as unknown as SetupField<G>[];
  }
  if (!BOT_GAMES.has(game)) return [];

  const bot = setup as BotGameSetup;
  const fields: SetupField<G>[] = [];
  if (mode === 'bot') fields.push(strengthField<G>(game as RatedGameId, bot));
  fields.push(colorField<G>(game, bot, mode));

  if (game === 'go') {
    fields.push(...(goFields(setup as GoSetup) as unknown as SetupField<G>[]));
  }

  if (mode === 'bot') {
    // Go only rates its standard ruleset, so choosing a bigger board is also a
    // choice to play unrated — said here rather than discovered at the result.
    const go = game === 'go' ? (setup as GoSetup) : null;
    const eligibility = go ? goRatedEligibility({ size: go.size, komi: go.komi }) : null;
    const blocked = eligibility && !eligibility.rated ? eligibility.reason : undefined;
    fields.push(ratedField<G>(bot, options.signedIn, blocked));
  }
  return fields;
}
