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

/** Base rent as a fraction of list price, with a floor so cheap planets still bite. */
const BASE_RENT_RATE = 0.06;
const MIN_BASE_RENT = 4;

/** A bare planet earns double rent when its owner holds the whole system. */
export const FULL_SYSTEM_RENT_MULTIPLIER = 2;

/** Warp-gate rent by number of gates the owner holds (1–4). */
export const LIQUIDATE_WARP_GATE_RENTS = [25, 50, 100, 200] as const;
export const LIQUIDATE_WARP_GATE_PRICE = 200;

/** Utility rent = dice total × this, depending on how many utilities are held. */
export const LIQUIDATE_UTILITY_MULTIPLIER_ONE = 4;
export const LIQUIDATE_UTILITY_MULTIPLIER_BOTH = 10;
export const LIQUIDATE_UTILITY_PRICE = 150;

/**
 * Mortgage pays half the list price; clearing it costs interest on top.
 * The interest is an integer *percent* so the money math stays exact — the
 * float form (`× 1.1`) makes 100 → 110.00000000000001 and overcharges a credit.
 */
export const MORTGAGE_RATE = 0.5;
export const UNMORTGAGE_INTEREST_PERCENT = 10;

/** Fine to leave impound. */
export const LIQUIDATE_IMPOUND_FINE = 100;

/** Failed doubles attempts before the release fee is forced. */
export const MAX_IMPOUND_TURNS = 3;

/** Consecutive doubles that send a player to impound. */
export const DOUBLES_LIMIT = 3;

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
    stipend: 250,
    maxRounds: null,
    debtRule: DEFAULT_DEBT_RULE,
  },
  quick: {
    mode: 'quick',
    startingCredits: 2400,
    stipend: 350,
    maxRounds: 20,
    debtRule: DEFAULT_DEBT_RULE,
  },
};

/** Player-count bounds. */
export const LIQUIDATE_MIN_PLAYERS = 2;
export const LIQUIDATE_MAX_PLAYERS = 6;
