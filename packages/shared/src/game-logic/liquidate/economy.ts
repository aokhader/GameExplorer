/**
 * Liquidate's economy — **all values authored for this project.**
 *
 * Rent is *derived from a formula* rather than transcribed from any printed
 * table, which keeps the numbers demonstrably our own and makes the whole curve
 * tunable from a few constants. Balance passes should change the constants here,
 * not individual planets.
 */

import type { ColonyLevel, DebtRule, LiquidateConfig, StarSystem } from './types';

/**
 * Rent multipliers applied to a planet's base rent, indexed by `ColonyLevel`
 * (`[bare, colony1, colony2, colony3, colony4, megastructure]`). The steep jump
 * at level 3 is what makes developing a full system decisive.
 */
export const LIQUIDATE_RENT_MULTIPLIERS = [1, 5, 15, 40, 60, 80] as const;

/**
 * Base rent as a fraction of list price, with a floor so cheap planets still bite.
 *
 * Balanced against the stipend, not chosen in isolation: a lap of the full board
 * averages ~6 turns, so each player earns `stipend / 6` per turn. If bare rents
 * do not claw a comparable amount back, credits only ever accumulate and a game
 * with no completed systems cannot end — which is exactly what the M6 simulation
 * found at 4–6 players. See `LIQUIDATE_CONFIGS`.
 */
const BASE_RENT_RATE = 0.09;
const MIN_BASE_RENT = 6;

/** A bare planet earns double rent when its owner holds the whole system. */
export const FULL_SYSTEM_RENT_MULTIPLIER = 2;

/**
 * Warp-gate rent by number of gates the owner holds (1–4).
 *
 * Derived, not tabulated — the same rule the property curve follows. Rent is
 * the base times the nth *triangular* number (1, 3, 6, 10), so each further
 * gate adds more than the one before it, and a player holding all four collects
 * the gate's entire list price on every landing. That last identity is the
 * design target: cornering the gates should read as obviously decisive.
 */
const WARP_GATE_BASE_RENT = 18;
export const LIQUIDATE_WARP_GATE_RENTS = [
  WARP_GATE_BASE_RENT * 1,
  WARP_GATE_BASE_RENT * 3,
  WARP_GATE_BASE_RENT * 6,
  WARP_GATE_BASE_RENT * 10,
] as const;
export const LIQUIDATE_WARP_GATE_PRICE = WARP_GATE_BASE_RENT * 10;

/**
 * Utility rent = dice total × this, depending on how many utilities are held.
 *
 * Also derived: holding both *squares* the multiplier rather than stepping to
 * an arbitrary second number, so the jump is a stated rule instead of a tuned
 * pair.
 */
const UTILITY_BASE_MULTIPLIER = 3;
export const LIQUIDATE_UTILITY_MULTIPLIER_ONE = UTILITY_BASE_MULTIPLIER;
export const LIQUIDATE_UTILITY_MULTIPLIER_BOTH = UTILITY_BASE_MULTIPLIER ** 2;
export const LIQUIDATE_UTILITY_PRICE = 140;

/**
 * Mortgaging pays 60% of list; clearing it costs interest on top.
 *
 * The pair is deliberately sharper than a plain half-and-a-tenth: this game is
 * named for the decision to liquidate, so borrowing gives real breathing room
 * and buying back hurts enough that it stays a decision.
 *
 * The interest is an integer *percent* so the money math stays exact — the
 * float form (`× 1.15`) reintroduces the rounding error that overcharges a
 * credit.
 */
export const MORTGAGE_RATE = 0.6;
export const UNMORTGAGE_INTEREST_PERCENT = 15;

/** Fine to leave impound. */
export const LIQUIDATE_IMPOUND_FINE = 100;

/** Failed doubles attempts before the release fee is forced. */
export const MAX_IMPOUND_TURNS = 2;

/**
 * Consecutive doubles that send a player to impound.
 *
 * Two, not three: at three the rule fires about once every 216 turn-sequences
 * and is effectively flavour. At two it is a live risk every time a double is
 * rolled, which makes the extra-turn reward genuinely double-edged.
 */
export const DOUBLES_LIMIT = 2;

/**
 * Trade offers one seat may make per turn.
 *
 * A hard structural cap: without it a bot proposer can fall into
 * propose → decline → propose forever (the same failure mode as the M3
 * mortgage/unmortgage cycle), and a pass-and-play player could stall the table.
 */
export const MAX_TRADE_PROPOSALS_PER_TURN = 2;

/** Star systems in ascending price tier. Index doubles as the tier number. */
export const STAR_SYSTEM_ORDER: readonly StarSystem[] = [
  'ember',
  'rust',
  'amber',
  'verdant',
  'azure',
  'violet',
  'crimson',
  'aurum',
];

/** Tier index (0–7) of a system, used for colony pricing. */
export function systemTier(system: StarSystem): number {
  return STAR_SYSTEM_ORDER.indexOf(system);
}

/** Colony cost rises with the system's tier: 50, 75, 100 … 225. */
export function colonyCostFor(system: StarSystem): number {
  return 50 + systemTier(system) * 25;
}

/** Base (undeveloped, non-monopolized) rent for a planet at `price`. */
export function baseRentFor(price: number): number {
  return Math.max(MIN_BASE_RENT, Math.round(price * BASE_RENT_RATE));
}

/** Round developed rents to the nearest 5 credits so the card reads cleanly. */
function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * Build a planet's full six-entry rent table from its list price.
 * Level 0 is exact; developed levels are rounded to the nearest 5.
 */
export function rentTableFor(
  price: number,
): readonly [number, number, number, number, number, number] {
  const base = baseRentFor(price);
  const [, m1, m2, m3, m4, m5] = LIQUIDATE_RENT_MULTIPLIERS;
  return [
    base,
    roundTo5(base * m1),
    roundTo5(base * m2),
    roundTo5(base * m3),
    roundTo5(base * m4),
    roundTo5(base * m5),
  ];
}

/** Credits returned by mortgaging a tile priced at `price`. */
export function mortgageValueFor(price: number): number {
  return Math.floor(price * MORTGAGE_RATE);
}

/** Cost to clear a mortgage on a tile priced at `price` (principal + interest). */
export function unmortgageCostFor(price: number): number {
  const principal = mortgageValueFor(price);
  return principal + Math.ceil((principal * UNMORTGAGE_INTEREST_PERCENT) / 100);
}

/** Rent for a planet at a given development level, before any full-system bonus. */
export function planetRent(
  rents: readonly [number, number, number, number, number, number],
  level: ColonyLevel,
): number {
  return rents[level];
}

/**
 * Default debt rule. `allow-negative` is the more forgiving option — a player
 * with assets can always mortgage their way out instead of being eliminated on
 * the spot — so it is the default, and the setup screen exposes the toggle.
 */
export const DEFAULT_DEBT_RULE: DebtRule = 'allow-negative';

/**
 * The two supported presets. Quick mode starts richer on a shorter loop and
 * ends on a round cap, so a session fits a phone sitting.
 *
 * `debtRule` here is only the preset default — `newGame` accepts an override so
 * the player's choice always wins.
 */
export const LIQUIDATE_CONFIGS: Record<'full' | 'quick', LiquidateConfig> = {
  full: {
    mode: 'full',
    startingCredits: 1800,
    // Tuned in M6. At 250 the stipend out-earned all rent on the board, so
    // credits only ever accumulated and 4–6 player games never terminated.
    stipend: 160,
    // Full mode is won by outlasting everyone, but a game where the survivors
    // are all solvent can otherwise run indefinitely. This is a safety net, not
    // the intended finish: it is far above a normal game's length, and when it
    // does trigger the richest player takes it.
    maxRounds: 140,
    debtRule: DEFAULT_DEBT_RULE,
  },
  quick: {
    mode: 'quick',
    startingCredits: 2400,
    stipend: 260,
    maxRounds: 20,
    debtRule: DEFAULT_DEBT_RULE,
  },
};

/** Player-count bounds. */
export const LIQUIDATE_MIN_PLAYERS = 2;
export const LIQUIDATE_MAX_PLAYERS = 6;
